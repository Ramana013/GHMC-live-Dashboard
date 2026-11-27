import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import L from 'leaflet';
import './App.css';
import GeoJSONLayer from './GeoJSONLayer';
import Analytics from './Analytics';

// Fix for default marker icons in React-Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const createCustomPin = (color) => {
  return L.divIcon({
    className: 'custom-pin',
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="25" height="41">
            <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24c0-6.627-5.373-12-12-12zm0 16.5c-2.485 0-4.5-2.015-4.5-4.5s2.015-4.5 4.5-4.5 4.5 2.015 4.5 4.5-2.015 4.5-4.5 4.5z" fill="${color}"/>
           </svg>`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
};

const getRiskColor = (risk) => {
  if (!risk) return '#3388ff';
  const r = risk.toLowerCase();
  if (r === 'very high') return '#800000';
  if (r === 'high') return '#ff0000';
  if (r === 'moderate') return '#ffa500';
  return '#00ff00';
};

function App() {
  const [submissions, setSubmissions] = useState([]);
  const [targetShops, setTargetShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wardsData, setWardsData] = useState(null);

  const [activeTab, setActiveTab] = useState('table');
  const [searchTerm, setSearchTerm] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  const fetchDashboardData = () => {
    Promise.all([
      axios.get('/api/submissions/'),
      axios.get('/api/target-shops/')
    ])
    .then(([subRes, targetRes]) => {
      const sortedData = subRes.data.sort((a, b) => {
        const dateA = a.date_of_assessment ? new Date(a.date_of_assessment) : new Date(0);
        const dateB = b.date_of_assessment ? new Date(b.date_of_assessment) : new Date(0);
        return dateB - dateA;
      });
      setSubmissions(sortedData);
      setTargetShops(targetRes.data);
    })
    .catch(error => console.error("Error fetching data:", error));
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    fetch('/ghmc-wards.geojson')
      .then(res => res.json())
      .then(data => {
        setWardsData(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading wards:", err);
        setLoading(false);
      });
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await axios.get('/api/kobo-sync/');
      if (response.data.status === 'success') {
        setSyncMessage({
          title: "Sync Complete!",
          created: response.data.created,
          updated: response.data.updated
        });
      }
      fetchDashboardData();
    } catch (error) {
      setSyncMessage({
        title: "Sync Failed",
        created: 0,
        updated: 0,
        error: "Could not connect to the server."
      });
    }
    setSyncing(false);
  };

  const getAdminDetails = (lat, lon) => {
    if (!lat || !lon || !wardsData || !wardsData.features) {
      return { ward: "N/A", circle: "N/A", zone: "N/A" };
    }
    const pt = point([Number(lon), Number(lat)]);

    for (let feature of wardsData.features) {
      try {
        if (booleanPointInPolygon(pt, feature)) {
          let props = feature.properties || {};
          let desc = props.Description || "";

          const getValFromHtml = (key) => {
            const regex = new RegExp(`<td[^>]*>\\s*${key}\\s*<\\/td>\\s*<td[^>]*>\\s*([^<]+)\\s*<\\/td>`, "i");
            const match = desc.match(regex);
            return match ? match[1].trim() : null;
          };

          const ward = props.Ward_Name || getValFromHtml("Ward_Name") || props.Name || "N/A";
          const circle = getValFromHtml("Circle_Nam") || getValFromHtml("Circle_Name") || props.Circle_Name || "N/A";
          const zone = getValFromHtml("Zone_Name") || getValFromHtml("Zone") || props.Zone_Name || "N/A";

          return { ward, circle, zone };
        }
      } catch (e) {}
    }
    return { ward: "N/A", circle: "N/A", zone: "N/A" };
  };

  const processedSubmissions = submissions.map(sub => {
    const details = getAdminDetails(sub.latitude, sub.longitude);
    return { ...sub, calculatedZone: details.zone, calculatedWard: details.ward, calculatedCircle: details.circle };
  });

  const mergedMapData = [];

  targetShops.forEach((target, index) => {
    const targetName = (target.shop_name || "").toLowerCase().trim();
    const koboMatch = processedSubmissions.find(sub => {
      const koboName = (sub.shop_name || "").toLowerCase().trim();
      return koboName.includes(targetName) || targetName.includes(koboName);
    });

    if (koboMatch) {
      koboMatch.isMatched = true;
      mergedMapData.push({
        id: `merged-${target.id || index}`,
        shop_name: koboMatch.shop_name,
        latitude: koboMatch.latitude || target.latitude,
        longitude: koboMatch.longitude || target.longitude,
        is_completed: true,
        details: koboMatch,
      });
    } else {
      mergedMapData.push({
        id: `target-${target.id || index}`,
        shop_name: target.shop_name,
        latitude: target.latitude,
        longitude: target.longitude,
        is_completed: false,
        details: null,
        zone: target.zone
      });
    }
  });

  processedSubmissions.forEach((sub, index) => {
    if (!sub.isMatched && sub.latitude && sub.longitude) {
      mergedMapData.push({
        id: `kobo-extra-${sub.kobo_id || index}`,
        shop_name: sub.shop_name,
        latitude: sub.latitude,
        longitude: sub.longitude,
        is_completed: true,
        details: sub,
      });
    }
  });

  const totalCount = mergedMapData.length;
  const completedCount = processedSubmissions.length;
  const remainingCount = totalCount - completedCount;

  const filteredMergedData = mergedMapData.filter(item => {
    const s = searchTerm.toLowerCase();
    const sub = item.details || {};
    return (
      (item.shop_name || "").toLowerCase().includes(s) ||
      (sub.stall_id || "").toLowerCase().includes(s) ||
      (sub.date_of_assessment || "").toLowerCase().includes(s) ||
      (sub.calculatedZone || "").toLowerCase().includes(s) ||
      (sub.calculatedWard || "").toLowerCase().includes(s) ||
      (sub.calculatedCircle || "").toLowerCase().includes(s) ||
      (sub.zonal_officer_name || "").toLowerCase().includes(s) ||
      (sub.submitted_by || "").toLowerCase().includes(s) ||
      (sub.risk_level || "").toLowerCase().includes(s)
    );
  });

  const filteredSubmissions = processedSubmissions.filter(sub => {
    const s = searchTerm.toLowerCase();
    return (
      (sub.date_of_assessment || "").toLowerCase().includes(s) ||
      (sub.shop_name || "").toLowerCase().includes(s) ||
      (sub.stall_id || "").toLowerCase().includes(s) ||
      (sub.calculatedZone || "").toLowerCase().includes(s) ||
      (sub.calculatedWard || "").toLowerCase().includes(s) ||
      (sub.calculatedCircle || "").toLowerCase().includes(s) ||
      (sub.zonal_officer_name || "").toLowerCase().includes(s) ||
      (sub.submitted_by || "").toLowerCase().includes(s) ||
      (sub.risk_level || "").toLowerCase().includes(s)
    );
  });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentTableData = filteredSubmissions.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredSubmissions.length / itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  if (loading) return <div style={{ padding: '20px', fontSize: '20px' }}>Loading Dashboard Data...</div>;

  return (
    <div className="dashboard-container">

      {/* CUSTOM MODAL OVERLAY */}
      {syncMessage && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: 'white', padding: '30px', borderRadius: '8px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)', minWidth: '300px', textAlign: 'center'
          }}>
            <h3 style={{ marginTop: 0, color: syncMessage.error ? 'red' : '#2c3e50' }}>
              {syncMessage.title}
            </h3>
            {syncMessage.error ? (
              <p style={{ color: 'red' }}>{syncMessage.error}</p>
            ) : (
              <div style={{ fontSize: '16px', marginBottom: '20px', textAlign: 'left' }}>
                <p style={{ margin: '5px 0' }}><b>New Records:</b> {syncMessage.created}</p>
                <p style={{ margin: '5px 0' }}><b>Updated Records:</b> {syncMessage.updated}</p>
              </div>
            )}
            <button
              onClick={() => setSyncMessage(null)}
              style={{
                padding: '10px 20px', backgroundColor: '#3498db', color: 'white',
                border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px'
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      <header className="header">
        <h2 style={{ margin: 0, fontSize: '20px' }}>GHMC Routing Dashboard</h2>
      </header>

      <div className="main-content">

        {/* LEFT SIDEBAR */}
        <div className="sidebar">
          <div style={{ display: 'flex', borderBottom: '1px solid #ccc' }}>
            <button onClick={() => setActiveTab('table')} style={{ flex: 1, padding: '10px', backgroundColor: activeTab === 'table' ? 'white' : '#e2e8f0', border: 'none', cursor: 'pointer', fontWeight: activeTab==='table'?'bold':'normal' }}>Survey Data</button>
            <button onClick={() => setActiveTab('analytics')} style={{ flex: 1, padding: '10px', backgroundColor: activeTab === 'analytics' ? 'white' : '#e2e8f0', border: 'none', cursor: 'pointer', fontWeight: activeTab==='analytics'?'bold':'normal' }}>Analytics</button>
            <button onClick={() => setActiveTab('targets')} style={{ flex: 1, padding: '10px', backgroundColor: activeTab === 'targets' ? 'white' : '#e2e8f0', border: 'none', cursor: 'pointer', fontWeight: activeTab==='targets'?'bold':'normal' }}>Target Status</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
            {activeTab === 'analytics' && <Analytics data={processedSubmissions} />}
            {activeTab === 'targets' && (
              <div>
                <h3>Target Status</h3>
                <div style={{ padding: '15px', backgroundColor: '#e6fffa', border: '1px solid #38b2ac', borderRadius: '8px', marginBottom: '20px' }}>
                  <p style={{ margin: '5px 0' }}><strong>Total Target Shops:</strong> {totalCount}</p>
                  <p style={{ margin: '5px 0', color: 'green' }}><strong>Completed Shops:</strong> {completedCount}</p>
                  <p style={{ margin: '5px 0', color: 'red' }}><strong>Remaining Shops:</strong> {remainingCount}</p>
                </div>
              </div>
            )}
            {activeTab === 'table' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

                {/* TITLE AND SYNC BUTTON ROW */}
                <div className="title-row">
                  <h3 style={{ margin: 0 }}>Total Completed Surveys: {filteredSubmissions.length}</h3>
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    style={{
                      padding: '8px 15px', backgroundColor: syncing ? '#95a5a6' : '#27ae60',
                      color: 'white', border: 'none', borderRadius: '4px', fontSize: '14px',
                      cursor: syncing ? 'not-allowed' : 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap'
                    }}
                  >
                    {syncing ? 'Syncing...' : '🔄 Sync Live Data'}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                  <input type="text" placeholder="Search by anything..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
                </div>

                <div className="table-wrapper" style={{ flex: 1, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                      <tr style={{ backgroundColor: '#e2e8f0', textAlign: 'left' }}>
                        <th style={{ padding: '6px', borderBottom: '2px solid #cbd5e1' }}>Date</th>
                        <th style={{ padding: '6px', borderBottom: '2px solid #cbd5e1' }}>Shop Name</th>
                        <th style={{ padding: '6px', borderBottom: '2px solid #cbd5e1' }}>Zone</th>
                        <th style={{ padding: '6px', borderBottom: '2px solid #cbd5e1' }}>Ward</th>
                        <th style={{ padding: '6px', borderBottom: '2px solid #cbd5e1' }}>Circle</th>
                        <th style={{ padding: '6px', borderBottom: '2px solid #cbd5e1' }}>Officer</th>
                        <th style={{ padding: '6px', borderBottom: '2px solid #cbd5e1' }}>Submitted By</th>
                        <th style={{ padding: '6px', borderBottom: '2px solid #cbd5e1' }}>Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentTableData.map(sub => (
                        <tr key={sub.kobo_id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '6px' }}>{sub.date_of_assessment || "N/A"}</td>
                          <td style={{ padding: '6px' }}>{sub.shop_name || "N/A"}</td>
                          <td style={{ padding: '6px' }}>{sub.calculatedZone}</td>
                          <td style={{ padding: '6px' }}>{sub.calculatedWard}</td>
                          <td style={{ padding: '6px' }}>{sub.calculatedCircle}</td>
                          <td style={{ padding: '6px' }}>{sub.zonal_officer_name || "N/A"}</td>
                          <td style={{ padding: '6px' }}>{sub.submitted_by || "N/A"}</td>
                          <td style={{ padding: '6px', fontWeight: 'bold', color: getRiskColor(sub.risk_level) }}>
                            {sub.risk_level || "N/A"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', padding: '10px', backgroundColor: 'white', borderRadius: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} style={{ padding: '8px 16px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', backgroundColor: currentPage === 1 ? '#e2e8f0' : '#2c3e50', color: currentPage === 1 ? '#a0aec0' : 'white', border: 'none', borderRadius: '4px' }}>
                    Previous
                  </button>
                  <span style={{ fontWeight: 'bold' }}>
                    Page {currentPage} of {totalPages || 1}
                  </span>
                  <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages || totalPages === 0} style={{ padding: '8px 16px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', backgroundColor: currentPage === totalPages ? '#e2e8f0' : '#2c3e50', color: currentPage === totalPages ? '#a0aec0' : 'white', border: 'none', borderRadius: '4px' }}>
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT MAP */}
        <div className="map-container">
          <MapContainer center={[17.3850, 78.4867]} zoom={11} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              referrerPolicy="strict-origin-when-cross-origin"
            />
            <GeoJSONLayer url="/ghmc-wards.geojson" styleOptions={{ fillOpacity: 0.05, weight: 1, color: '#999' }} />
            <GeoJSONLayer url="/ghmc-wards.geojson" styleOptions={{ weight: 1, color: '#444' }} colorByZone={true} />

            {filteredMergedData.map((item, index) => {
              let pinColor = '#3388ff';
              if (item.is_completed && item.details) {
                pinColor = getRiskColor(item.details.risk_level);
              }

              const lat = Number(item.latitude);
              const lon = Number(item.longitude);

              if (isNaN(lat) || isNaN(lon)) {
                return null;
              }

              return (
                <Marker
                  key={item.id || `marker-${index}`}
                  position={[lat, lon]}
                  icon={createCustomPin(pinColor)}
                >
                  <Popup>
                    <strong style={{ color: pinColor, fontSize: '14px' }}>
                      {item.shop_name || "N/A"}
                    </strong><br/>
                    <b>Status:</b> {item.is_completed ? "✅ Completed" : "❌ Remaining"}<br/>

                    {item.details ? (
                      <>
                        <hr style={{ margin: '5px 0' }} />
                        <b>Stall ID:</b> {item.details.stall_id || "N/A"}<br/>
                        <b>Date:</b> {item.details.date_of_assessment || "N/A"}<br/>
                        <b>Owner:</b> {item.details.owner_name || "N/A"}<br/>
                        <b>Mobile:</b> {item.details.owner_mobile || "N/A"}<br/>
                        <b>Zone:</b> {item.details.calculatedZone || "N/A"}<br/>
                        <b>Ward:</b> {item.details.calculatedWard || "N/A"}<br/>
                        <b>Circle:</b> {item.details.calculatedCircle || "N/A"}<br/>
                        <b>Zonal Officer:</b> {item.details.zonal_officer_name || "N/A"}<br/>
                        <b>Submitted By:</b> {item.details.submitted_by || "N/A"}<br/>
                        <b>Risk Level:</b> <span style={{ fontWeight: 'bold', color: getRiskColor(item.details.risk_level) }}>
                          {item.details.risk_level || "N/A"}
                        </span>
                      </>
                    ) : (
                      <>
                        <b>Type:</b> {item.details?.shop_type || "Target Shop"}<br/>
                        <b>Zone:</b> {item.zone || "N/A"}<br/>
                      </>
                    )}
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>

      </div>
    </div>
  );
}

export default App;