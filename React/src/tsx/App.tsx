import { useState, useEffect } from 'react'
import '../App.css'
import Card from './Card.tsx'
import Filter from './Filter.tsx'
import PogDesign from './pogDesign.tsx'
import {type Pog} from '../types.ts'

function App() {
  const [pogs, setPogs] = useState<Pog[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [rarity, setRarity] = useState<string | null>(null);
  const [viewDesc, setViewDesc] = useState(false);
  const [selectedPog, setSelectedPog] = useState<Pog | null>(null);
  const [typingInBox, setTypingInBox] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newName, setNewName] = useState("");
  const [newRank, setNewRank] = useState("");
  const [newCreator, setNewCreator] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newColor, setNewColor] = useState("");
  const [user, setUser] = useState<string | null>(null);
  const IP = "172.16.3.254"; // Local IP address of the backend server, change if needed
  const admin = user === "CarterQ" || user === "MrSmith" || user === "VincentL";
  const colors = {
    Trash: '#757028',
    Common: '#deee4d',
    Uncommon: '#6bce3e',
    Rare: '#34acdb',
    Legendary: '#bc74ff',
    Mythic: '#FF4500',
    Unknown: '#000000'
  };

  useEffect(() => {
    const controller = new AbortController();

    const query = new URLSearchParams({
      page: String(page),
      limit: "14",
      search
    });

    if (tag) query.append("tag", tag);
    if (rarity) query.append("rarity", rarity);

    fetch(`http://${IP}:3000/api/pogs?${query.toString()}`, {
      signal: controller.signal
    })
      .then(res => res.json())
      .then(data => {
        setPogs(data.data);
        setTotalPages(data.totalPages);
      });
    fetch(`http://${IP}:3000/getdata`, {
      signal: controller.signal
    })
      .then(res => res.json())
      .then(data => {
        console.log(data.user);
        setUser(data.user);
      });
  }, [page, search, tag, rarity]);

  useEffect(() => {
    setPage(1);
  }, [search, tag, rarity]);

  return (
    <>
      <div>
        <div className = "title">
          <h1 className = "header" style= {
            {pointerEvents: "none"}
          }>Pogipedia</h1>
          <PogDesign />
        </div>
        <div className = "box">
          <div>
            <p className = "user">Logged in as <strong>{user}</strong></p>
            <p className = "underhead"></p>
          </div>
          {!viewDesc && (
            <div className = "wrapper">
              <div className = "toolsContainer">
                <input 
                  className="search" 
                  type="text" 
                  placeholder='Search by name'
                value={search}
                onChange={(e) => setSearch(e.target.value)}>
              </input>
              <Filter filter="tags" openFilter={openFilter} setOpenFilter={setOpenFilter} setTags={setTag} setRarity={setRarity} currentTag={tag} currentRarity={rarity} />
              <Filter filter="rarity" openFilter={openFilter} setOpenFilter={setOpenFilter} setTags={setTag} setRarity={setRarity} currentTag={tag} currentRarity={rarity} />
            </div>
            <div className = "container">
              <div className = "grid">
                {pogs && pogs.map((pog, i) => (
                  <Card pog={pog} key={i} search={search} onClick={() => { setViewDesc(!viewDesc); setSelectedPog(pog); }} />
                ))}
              </div>
                {totalPages == 0 && <span>No pogs found</span>}
                {totalPages != 0 &&
                  <div className = "nav-container">
                    <button className = "nav"
                      disabled={page === 1} 
                      onClick={() => setPage(prev => prev - 1)}>
                      <p className = "backtxt" style={{margin: 0}}>➤</p>
                    </button>
                    <span>{page} / {totalPages}</span>
                    <button className = "nav"
                      disabled={page === totalPages} 
                      onClick={() => setPage(prev => prev + 1)}>
                    <p className = "nexttxt" style={{margin: 0}}>➤</p>
                    </button>
                  </div>
                }
            </div>
          </div>)}
          {viewDesc && (
            <div className = "desc">
              <div className = "topGradient" style={{background: `linear-gradient(to bottom, ${colors[selectedPog?.rank as keyof typeof colors] || colors.Unknown} 10%, transparent 80%)`}}></div>
              <div className = "toolsStretch">
                <button className = "nav leave"
                  onClick={() => {setViewDesc(!viewDesc); setTypingInBox(false); setNewDesc(""); setNewName(""); setNewRank(""); setNewCreator(""); setNewTags(""); setNewColor("");}}>
                  <p className = "backtxt" style={{margin: 0}}>➤</p>
                  <p>Back</p>
                </button>
                {true && (
                  <div className = "editBtns" style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center'
                  }}>
                  <button className = "nav cancel" onClick={() => {
                    setTypingInBox(false);
                    setNewDesc("");
                    setNewName("");
                    setNewRank("");
                    setNewCreator("");
                    setNewTags("");
                    setNewColor("");
                  }} style={{display: typingInBox ? "flex" : "none"}}>
                    <img src="/icons/x-mark-icon.png" width="18" height="18"/>
                    <p>Cancel</p>
                  </button>
                  <button className = "nav edit" onClick={() => {
                      if (!typingInBox) {
                        // Entering edit mode: prefill both editable fields.
                        setNewDesc(selectedPog?.lore ?? "");
                        setNewName(selectedPog?.name ?? "");
                        setNewRank(selectedPog?.rank ?? "");
                        setNewCreator(selectedPog?.creator ?? "");
                        setNewTags(selectedPog?.tags ?? "");
                        setNewColor(selectedPog?.color ?? "");
                        setTypingInBox(true);
                        return;
                      }
                      if (!selectedPog) return;
                      // Permission check before performing the fetch
                      if (!admin) {
                        alert("You do not have permission to edit the information.");
                        setTypingInBox(false);
                        setNewDesc("");
                        return;
                      }
                      // Submit the edited name and lore to the backend.
                      fetch(`http://${IP}:3000/api/update-pog`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          uid: selectedPog.uid,
                          lore: newDesc,
                          name: newName,
                          rank: newRank,
                          creator: newCreator,
                          tags: newTags,
                          color: newColor,
                        }),
                      })
                      .then(async res => {
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Failed to update pog');
                        return data;
                      })
                      .then(data => {
                        if (selectedPog) {
                          const updatedPog = {
                            ...selectedPog,
                            lore: newDesc,
                            name: newName,
                            rank: newRank,
                            creator: newCreator,
                            tags: newTags,
                            color: newColor,
                          };
                          setSelectedPog(updatedPog);
                          setPogs(currentPogs => currentPogs.map(pog => pog.uid === updatedPog.uid ? updatedPog : pog));
                          console.log(`${selectedPog.name}'s information was updated`, data);
                        }
                      })
                      .catch(err => {
                        console.error('Error updating pog:', err);
                        alert(err.message);
                      })
                      .finally(() => setTypingInBox(false));
                    }}>
                    <img src={typingInBox ? "/icons/checkmark-black-icon.png" : "/icons/edit-tool-pencil.svg"} width={typingInBox ? "20" : "25"} height={typingInBox ? "20" : "25"}/>
                    <p className = "edittxt">{typingInBox ? "Submit" : "Edit"}</p>
                  </button>
                </div>)}
              </div> 
              <div className = "descTitle">
                <img className = "descImg" src={`/pogs/${selectedPog?.code2}.webp`} alt={selectedPog?.name} width="200" height="200"/>
                {typingInBox ? <textarea 
                  className = "nameEditBox" 
                  value={newName}
                  placeholder={selectedPog?.name}
                  onChange={(e) => setNewName(e.target.value)} 
                /> : (<h1 className = "descName">{selectedPog?.name}</h1>)}
              </div>
              {typingInBox ? (
                <textarea 
                  className = "descEditBox" 
                  value={newDesc}
                  placeholder={selectedPog?.lore || "Description coming soon!"}
                  onChange={(e) => setNewDesc(e.target.value)} 
                />
              ) : (
                <p className = "descTxt">{selectedPog?.lore || "Description coming soon!"}</p>
              )}
              <div className = "infoCont">
                <div className = "inf">
                    {typingInBox ? <label>Rarity: <input value={newRank} onChange={(e) => setNewRank(e.target.value)} /></label> : <h5>Rarity: {selectedPog?.rank}</h5>}
                </div>
                <div className = "inf">
                  {typingInBox ? <label>Creator: <input value={newCreator} onChange={(e) => setNewCreator(e.target.value)} /></label> : <h5>Creator: {selectedPog?.creator}</h5>}
                </div>
                <div className = "inf">
                  {typingInBox ? <label>Type: <input value={newTags} onChange={(e) => setNewTags(e.target.value)} /></label> : <h5>Type: {selectedPog?.tags}</h5>}
                </div>
                <div className = "inf">
                  {typingInBox ? <label>Color: <input value={newColor} onChange={(e) => setNewColor(e.target.value)} /></label> : <h5>Color: {selectedPog?.color}</h5>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default App
