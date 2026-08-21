const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const AUTH_URL = 'http://formbar.yorktechapps.com/oauth';
const THIS_URL = 'http://172.16.3.254:3000/login';
const app = express();
const port = 3000;
const cors = require('cors');

app.use(cors({origin: '*'}));

// Middleware to parse JSON bodies
app.use(bodyParser.json());
app.use(session({
  secret: 'mYl!ttL3Gn!',
  resave: false,
  saveUninitialized: false,
}));

// Redirect unauthenticated root requests to /login before static files are served
app.use((req, res, next) => {
  if (req.path === '/' && !(req.session && req.session.user)) {
    return res.redirect('/login');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'React/dist')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/pogs', express.static(path.join(__dirname, 'pogs')));
app.use('/icons', express.static(path.join(__dirname, 'icons')));

// Connect to SQLite database
const dbPath = path.resolve(__dirname, 'db', 'pog.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    initializeDatabase();
    seedDatabaseFromCsv();
  }
});

// Check if dark mode is enabled through environment variable
let darkMode = false;
if (process.env.DARK_MODE === 'true') {
  darkMode = true;
}

// Define color schemes for light and dark modes
const lightRanks = {
  'Uncommon': '#EBF8DC',
  'Trash': '#fcdcdc',
  'Common': '#ffedc1',
  'Rare': '#DCF2F8',
  'Mythic': '#E7D5F3',
  'Default': '#FFFFFF'
};

const darkRanks = {
  'Uncommon': '#3d442f',
  'Trash': '#412020',
  'Common': '#4b3317',
  'Rare': '#2d3f4d',
  'Mythic': '#34314b',
  'Default': '#333333'
};

// Function to get background color based on rank and theme
function getBackgroundColor(rank) {
  return darkMode ? darkRanks[rank] || darkRanks['Default'] : lightRanks[rank] || lightRanks['Default'];
}

// Function to initialize the database
function initializeDatabase() {
  db.serialize(() => {
    // Create the 'pogs' table if it doesn't exist
    db.run(`
      CREATE TABLE IF NOT EXISTS pogs (
        uid INTEGER PRIMARY KEY,
        serial TEXT,
        name TEXT NOT NULL,
        color TEXT,
        tags TEXT NOT NULL,
        lore TEXT,
        rank TEXT,
        creator TEXT,
        code2 TEXT, 
        attribute TEXT
      )
    `);

    // Create the 'variations' table if it doesn't exist
    db.run(`
      CREATE TABLE IF NOT EXISTS variations (
        uid INTEGER PRIMARY KEY,
        pog_id INTEGER NOT NULL,
        variation TEXT NOT NULL,
        FOREIGN KEY (pog_id) REFERENCES pogs (uid)
      )
    `);

    // Create the 'users' table if it doesn't exist
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        fb_name TEXT NOT NULL,
        fb_id TEXT UNIQUE NOT NULL
      )
    `);
    // Ensure additional columns for role/fid/etc exist
    db.get("PRAGMA table_info(users)", (err, info) => {
      // We'll query the table info properly below instead of using this callback value
    });
    db.all("PRAGMA table_info(users)", (err, cols) => {
      if (err) return;
      const names = (cols || []).map(c => c.name);
      if (!names.includes('fb_role')) {
        db.run('ALTER TABLE users ADD COLUMN fb_role TEXT');
      }
      if (!names.includes('fid')) {
        db.run('ALTER TABLE users ADD COLUMN fid TEXT');
      }
      if (!names.includes('fb_email')) {
        db.run('ALTER TABLE users ADD COLUMN fb_email TEXT');
      }
    });
  });
}

function seedDatabaseFromCsv() {
  const csvPath = path.resolve(__dirname, 'db', 'pogs.csv');

  if (!fs.existsSync(csvPath)) {
    console.warn('CSV seed file not found:', csvPath);
    return;
  }

  const csvData = fs.readFileSync(csvPath, 'utf8');
  const lines = csvData.split(/\r?\n/).filter(line => line.trim().length > 0);

  function parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values;
  }

  const tagCategories = {
    slammerTag: ['Igglybuff', 'Pichu', 'Magikarp'],
    itemTag: ['Potion Item', 'Poke Flute Item', 'Switch Item', 'Thunder Stone', 'Fire Stone', 'Water Stone', 'Moon Stone', 'Focus Sash', 'Silph Scope', 'Berry', 'HM01 Cut', 'HM02 Fly', 'HM03 Surf', 'HM04 Dig', 'SS Anne Ticket', 'Fishing Rod', 'Full Heal', 'Old Amber'],
    energyTag: ['Fairy Energy', 'Fire Energy', 'Water Energy', 'Dark Energy', 'Steel Energy', 'Lightning Energy', 'Grass Energy', 'Psychic Energy', 'Fighting Energy', 'Normal Energy'],
    runeTag: ['Rune'],
    trainerTag: ['Ms.Hicks Trainer', 'Merkert Trainer'],
    classTag: ['CP', 'York Tech Cyber 22-23', 'Cyber Security', 'SW', 'York Tech Cyber', 'Career Camp', 'Hardware', 'I [Heart] CP']
  };

  const getTag = (name) => {
    if (tagCategories.slammerTag.includes(name)) return 'Slammer';
    if (tagCategories.itemTag.includes(name)) return 'Item';
    if (tagCategories.energyTag.includes(name)) return 'Energy';
    if (tagCategories.trainerTag.includes(name)) return 'Trainer';
    if (name.includes('Rune')) return 'Rune';
    if (tagCategories.classTag.includes(name)) return 'YCST';
    return 'None';
  };

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    lines.forEach((line) => {
      const values = parseCsvLine(line);
      const uid = parseInt(values[0], 10);
      if (Number.isNaN(uid)) return;

      const [, name, color, serial, , code2, lore, tags, rank, creator] = values;
      
      // Insert only if the row doesn't exist yet to avoid overwriting user edits (especially `lore`)
      db.run(`INSERT OR IGNORE INTO pogs (
        uid, serial, name, color, tags, lore, rank, creator, code2, attribute
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uid, serial, name || '', color || '', tags || '', lore || '', rank || '', creator || '', code2 || '', getTag(name)], function(err) {
        if (err) {
          console.error('Seed insert error for uid', uid, err);
          return;
        }

        // If the existing row has no lore, populate it from CSV. This prevents overwriting
        // any lore that was edited by users after initial seeding.
        db.run(
          'UPDATE pogs SET name = ?, lore = ? WHERE uid = ? AND (lore IS NULL OR TRIM(lore) = "")',
          [name, lore || '',  uid],
          function(uErr) {
            if (uErr) console.error('Seed update lore error for uid', uid, uErr);
          }
        );  
      });
    });

    db.run('COMMIT');
  });
}

function isAuthenticated(req, res, next) {
  if (req.session.user) {
      const tokenData = req.session.token;

      try {
          // Check if the token has expired
          const currentTime = Math.floor(Date.now() / 1000);
          if (tokenData.exp < currentTime) {
              throw new Error('Token has expired');
          }

          next();
      } catch (err) {
          res.redirect(`${FBJS_URL}/oauth?refreshToken=${tokenData.refreshToken}&redirectURL=${THIS_URL}`);
      }
  } else {
      res.redirect(`/login?redirectURL=${THIS_URL}`);
  }
}

// Route to serve the compiled default index page (require login)
app.get('/', (req, res) => {
  if (req.session && req.session.user) {
    return res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Not authenticated — redirect to login
  return res.redirect('/login');
});

// Route to handle theme preference
app.post('/setTheme', (req, res) => {
  darkMode = req.body.darkMode;
  res.sendStatus(200);
});

// Route to handle search request
app.post('/searchPogs', (req, res) => {
  const { id, name, serial, tags } = req.body;
  let query = 'SELECT * FROM pogs WHERE 1=1';
  let params = [];

  // Add conditions to the query based on the provided search parameters
  if (id) {
    query += ' AND uid = ?';
    params.push(id);
  }
  if (name) {
    query += ' AND name LIKE ?';
    params.push(`%${name}%`);
  }
  if (serial) {
    query += ' AND serial LIKE ?';
    params.push(`%${serial}%`);
  }
  if (tags) {
    query += ' AND tags LIKE ?';
    params.push(`%${tags}%`);
  }

  // Execute the query and return the results
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).send(err.message);
    }
    rows.forEach(row => {
      row.backgroundColor = getBackgroundColor(row.rank); // Add background color based on rank
    });
    res.json(rows);
  });
});

app.get('/api/pogs', (req, res) => {
  const search = req.query.search || "";
  const tag = req.query.tag || "";
  const rarity = req.query.rarity || "";

  const page = parseInt(req.query.page) || 1;
  const limit = 14;
  const offset = (page - 1) * limit;

  let where = [];
  let params = [];

  // SEARCH
  if (search.trim() !== "") {
    where.push("name LIKE ?");
    params.push(`%${search}%`);
  }

  // TAG
  if (tag) {
    where.push("attribute = ?");
    params.push(tag);
  }

  // RARITY
  if (rarity) {
    where.push("rank = ?");
    params.push(rarity);
  }

  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const dataQuery = `
    SELECT * FROM pogs
    ${whereSQL}
    LIMIT ? OFFSET ?
  `;

  const countQuery = `
    SELECT COUNT(*) as total FROM pogs
    ${whereSQL}
  `;

  db.all(dataQuery, [...params, limit, offset], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }

    db.get(countQuery, params, (err, countRow) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
      }

      res.json({
        data: rows,
        page,
        total: countRow.total,
        totalPages: Math.ceil(countRow.total / limit)
      });
    });
  });
});

// Route to get all data about an individual pog
app.get('/api/pogs/:uid', (req, res) => {
  const uid = req.params.uid;
  db.get('SELECT * FROM pogs WHERE uid = ?', [uid], (err, row) => {
    if (err) {
        res.status(500).json({ error: err.message });
    } else {
        res.json(row);
    }
  });
});

// Route to update editable pog information
app.post('/api/update-pog', (req, res) => {
  const { uid, name, lore, rank, creator, tags, color } = req.body;

  if (!uid || typeof name !== 'string' || typeof lore !== 'string' ||
      typeof rank !== 'string' || typeof creator !== 'string' ||
      typeof tags !== 'string' || typeof color !== 'string') {
    return res.status(400).json({ error: 'Invalid request data' });
  }

  db.run(
    'UPDATE pogs SET name = ?, lore = ?, rank = ?, creator = ?, tags = ?, color = ? WHERE uid = ?',
    [name, lore, rank, creator, tags, color, uid],
    function (err) {
      if (err) {
        console.error('Error updating pog:', err);
        return res.status(500).json({ error: 'Failed to update pog' });
      }

      res.json({ message: 'Pog updated successfully', changes: this.changes });
    }
  );
});

// Route to update a pog's description (lore)
app.put('/api/pogs/:uid/changeInfo', (req, res) => {
  const uid = req.params.uid;
  const { lore, rank } = req.body;

  if (typeof lore !== 'string') {
    return res.status(400).json({ error: 'Invalid or missing `lore` in request body' });
  }

  db.run('UPDATE pogs SET lore = ?, rank = ? WHERE uid = ?', [lore, rank, uid], function(err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }

    // Return the updated row
    db.get('SELECT * FROM pogs WHERE uid = ?', [uid], (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true, data: row });
    });
  });
});

app.get('/api/declarePage', (req, res) => {
  page = 1;
  return page;
});

app.get('/api/pagify', (req, res) => {
  page++;
  return page;
});

// Route to get all data about an individual pog, including variations
app.get('/api/pogs/:identifier', (req, res) => {
  const identifier = req.params.identifier;
  let sql;
  let params;

  // Check if the identifier is a number (uid) or matches a serial number pattern
  if (!isNaN(identifier)) {
    sql = 'SELECT uid, serial, name, color, tags, lore, rank, creator FROM pogs WHERE uid = ?';
    params = [identifier];
  } else if (/^\d{4}[A-Z]{1}\d{2}$/.test(identifier)) { // Adjust the regex pattern to match your serial number format
    sql = 'SELECT uid, serial, name, color, tags FROM pogs WHERE serial = ?';
    params = [identifier];
  } else {
    return res.status(400).send('Invalid identifier format');
  }

  db.get(sql, params, (err, row) => {
    if (err) {
      return res.status(500).send(err.message);
    }
    res.json(row);
  });
});

// Route to get all collections (tags)
app.get('/api/collections', (req, res) => {
  const sql = 'SELECT DISTINCT tags FROM pogs';
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).send(err.message);
    }
    res.json(rows);
  });
});

// Route to get all pogs in a specific collection (tag)
app.get('/api/collections/:name', (req, res) => {
  const name = req.params.name;
  const sql = 'SELECT uid, name, color FROM pogs WHERE tags = ?';
  db.all(sql, [name], (err, rows) => {
    if (err) {
      return res.status(500).send(err.message);
    }
    res.json(rows);
  });
});

// Route to log users in through Formbar Oauth
app.get('/login', (req, res) => {
  if (req.query.token) {
    let tokenData;
    try {
      tokenData = jwt.decode(req.query.token) || {};
    } catch (e) {
      console.error('Failed to decode token', e);
      return res.status(400).send('Invalid token');
    }

    req.session.token = tokenData;

    // Normalize possible token fields for id, name, role, fid, email
    const fb_id = tokenData.id || tokenData.sub || tokenData.fb_id || tokenData.user_id || null;
    const fb_name = tokenData.username || tokenData.name || tokenData.fb_name || tokenData.displayName || 'Unknown User';
    const fb_role = tokenData.role || tokenData.roles || tokenData.role_name || tokenData.fb_role || null;
    const fid = tokenData.fid || tokenData.FID || tokenData.formbar_id || null;
    const fb_email = tokenData.email || tokenData.fb_email || null;

    // Store in session for later use
    req.session.user = fb_name;
    req.session.fb_id = fb_id;
    req.session.fb_role = fb_role;
    req.session.fid = fid;
    req.session.fb_email = fb_email;

    if (!fb_id) {
      console.warn('No fb_id available in token; session has limited info', tokenData);
      return res.redirect('/');
    }

    const selectQuery = `SELECT * FROM users WHERE fb_id = ?`;
    db.get(selectQuery, [fb_id], (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).send('There was an error:\n' + err);
      }

      if (row) {
        const updateSql = `UPDATE users SET fb_name = ?, fb_role = ?, fid = ?, fb_email = ? WHERE fb_id = ?`;
        db.run(updateSql, [fb_name, fb_role, fid, fb_email, fb_id], (uErr) => {
          if (uErr) console.error('Failed to update user fields', uErr);
          req.session.user = fb_name;
          console.log('User found and updated, redirecting to catalogue');
          return res.redirect('/');
        });
      } else {
        const insertSql = `INSERT INTO users (fb_name, fb_id, fb_role, fid, fb_email) VALUES (?, ?, ?, ?, ?)`;
        db.run(insertSql, [fb_name, fb_id, fb_role, fid, fb_email], function(iErr) {
          if (iErr) {
            console.error(iErr);
            return res.status(500).send('There was an error:\n' + iErr);
          }
          req.session.user = fb_name;
          console.log('User inserted into users, redirecting to catalogue');
          return res.redirect('/');
        });
      }
    });
  } else {
    res.redirect(`${AUTH_URL}?redirectURL=${THIS_URL}`);
  }
});

// Start the server
// on port 3000
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

app.get('/getdata', (req, res) => {
  res.json({
    user: req.session.user || 'Guest',
  });
});