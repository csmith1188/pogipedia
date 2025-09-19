const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const { send } = require('process');
const AUTH_URL = 'http://localhost:420/oauth'; // replace with desiered OAuth URL. Currently set to local Formbar instance
const THIS_URL = 'http://localhost:3000/login';
const app = express();
const port = 3000;

// Set the view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware to parse JSON bodies
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'mYl!ttL3Gn!',
  resave: false,
  saveUninitialized: false,
}));

// Connect to SQLite database
const dbPath = path.resolve(__dirname, 'db', 'pog.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    initializeDatabase();
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
        description TEXT,
        imageUrl TEXT
      )
    `);

    // Create the 'users' table if it doesn't exist
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
      fb_name TEXT NOT NULL,
      fb_id TEXT NOT NULL
      )
      `);

      // Create the 'votes' table if it doesn't exist
      db.run(`
        CREATE TABLE IF NOT EXISTS votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        pog_id INTEGER NOT NULL,
        vote_type TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (fb_id),
        FOREIGN KEY (pog_id) REFERENCES pogs (uid)
        )
        `)

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

// Route to render the index page
app.get('/', (req, res) => {
  // Fetch all pogs from the database
  db.all('SELECT * FROM pogs', (err, pogs) => {
    if (err) {
      return res.status(500).send(err.message);
    }

    // Render the index page with the fetched pogs and pass necessary data to the template
    res.render('index', {
      user: req.session.user,
      pogs: pogs,
      getBackgroundColor: getBackgroundColor, // Pass the function to the template
      ranks: darkMode ? darkRanks : lightRanks // Pass the ranks object to the template
    });
  });
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

// Route to get all pogs with sorting options
app.get('/api/pogs', (req, res) => {
  const sortBy = req.query.sortBy || 'uid'; // Default sort by ID
  const sortOrder = req.query.sortOrder === 'desc' ? 'DESC' : 'ASC'; // Default sort order is ascending

  // Validate the sortBy parameter to prevent SQL injection
  const validSortColumns = ['uid', 'serial', 'name', 'color', 'tags', 'rank', 'upvotes', 'downvotes'];
  if (!validSortColumns.includes(sortBy)) {
    return res.status(400).send('Invalid sort column');
  }

  const sql = `SELECT uid, serial, name, color, tags, rank, upvotes, downvotes FROM pogs ORDER BY ${sortBy} ${sortOrder}`;
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).send(err.message);
    }
    res.json(rows);
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

// Route to handle upvotes
app.post('/api/pogs/:id/upvote', isAuthenticated, (req, res) => {
  const pogId = req.params.id;
  const userId = req.session.token.id; // Use the logged-in user's ID

  // Check if the user has already voted
  db.get('SELECT * FROM votes WHERE user_id = ? AND pog_id = ?', [userId, pogId], (err, row) => {
    if (err) return res.status(500).send(err.message);

    if(row) {
      if(row.vote_type === 'upvote') {
        return res.status(400).send('You have already upvoted this pog.');
      } else {
        // Change downvote to upvote
        db.run('UPDATE votes SET vote_type = ? WHERE id = ?', ['upvote', row.id], (err) => {
          if (err) return res.status(500).send (err.message);
          db.run('UPDATE pogs SET upvotes = upvotes + 1, downvotes = downvotes -1 WHERE uid = ?', [pogId], (err) => {
            if (err) return res.status(500).send(err.message);
          });
        });
      };
    } else {
      // Add a new upvote
      db.run('INSERT INTO votes (user_id, pog_id, vote_type) VALUES (?, ?, ?)', [userId, pogId, 'upvote'], (err)=> {
        if (err) return res.status(500).send(err.message);
        db.run('UPDATE pogs SET upvotes = upvotes + 1 WHERE uid = ?', [pogId], (err)=> {
          if (err) return res.status(500).send(err.message);
          res.send('Pog Upvoted.');
        })
      })
    }
  });
});

// Route to handle downvotes
app.post('/api/pogs/:id/downvote', isAuthenticated, (req, res) => {
  const pogId = req.params.id;
  const userId = req.session.token.id; // Use the logged-in user's ID

  // Check if the user has already voted
  db.get('SELECT * FROM votes WHERE user_id = ? AND pog_id = ?', [userId, pogId], (err, row) => {
    if (err) return res.status(500).send(err.message);

    if (row) {
      if (row.vote_type === 'downvote') {
        return res.status(400).send('You have already downvoted this pog.');
      } else {
        // Change upvote to downvote
        db.run('UPDATE votes SET vote_type = ? WHERE id = ?', ['downvote', row.id], (err) => {
          if (err) return res.status(500).send(err.message);

          db.run('UPDATE pogs SET downvotes = downvotes + 1, upvotes = upvotes - 1 WHERE uid = ?', [pogId], (err) => {
            if (err) return res.status(500).send(err.message);
            res.send('Vote updated to downvote.');
          });
        });
      }
    } else {
      // Add a new downvote
      db.run('INSERT INTO votes (user_id, pog_id, vote_type) VALUES (?, ?, ?)', [userId, pogId, 'downvote'], (err) => {
        if (err) return res.status(500).send(err.message);

        db.run('UPDATE pogs SET downvotes = downvotes + 1 WHERE uid = ?', [pogId], (err) => {
          if (err) return res.status(500).send(err.message);
          res.send('Pog downvoted.');
        });
      });
    }
  });
});

// Route to handel removeing votes
app.post('/api/pogs/:id/removevote', isAuthenticated, (req, res) => {
  const pogId = req.params.id;
  const userId = req.session.token.id; // Use the logged-in user's ID

  // Check if the user has already voted
  db.get('SELECT * FROM votes WHERE user_id = ? AND pog_id = ?', [userId, pogId], (err,row)=> {
    if (err) return res.status(500).send(err.message);

    if(row) {
      // Remove a vote
      db.run('DELETE FROM votes WHERE id = ?', [row.id], (err)=>{
        if (err) return res.status(500).send(err.message);

        const voteColumn = row.vote_type === 'upvote' ? 'upvotes' : 'downvotes';
        db.run(`UPDATE pogs SET ${voteColumn} = ${voteColumn} -1 WHERE uid = ?`, [pogId], (err)=>{
          if (err) return res.status(500).send(err.message);
          res.send('Vote removed.');
        });
      })
    } if (!row) {
      res.status(400).send('You have not voted on this pog.')
    }
  })
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
    let tokenData = jwt.decode(req.query.token);
    req.session.token = tokenData;
    req.session.user = tokenData.username;

    let fb_id = req.session.token.id;
    let fb_name = req.session.user;
    let query = `SELECT * FROM users WHERE fb_id = ?`;

    db.get(query, [fb_id], (err, row) => {
        if (err) {
            console.log(err);
            console.error(err);
            res.send("There was an error:\n" + err)
        } else if (row) {
            req.session.user = fb_name; // Ensure session is set
            console.log("User found in users, redirecting to catologue");
            res.redirect('/');
        } else {
            db.run(`INSERT INTO users(fb_name, fb_id) VALUES(?, ?)`, [fb_name, fb_id], (err) => {
                if (err) {
                    console.log(err);
                    console.error(err);
                    res.send("There was an error:\n" + err)
                } else {
                    req.session.user = fb_name; // Ensure session is set
                    console.log("User inserted into users, redirecting to catalogue");
                    res.redirect('/');
                }
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