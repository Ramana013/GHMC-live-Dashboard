import React, { useMemo } from 'react';

function Analytics({ data }) {
  // 1. Calculate Zone Stats
  const zoneStats = useMemo(() => {
    const stats = {};
    data.forEach(sub => {
      const zone = sub.calculatedZone || "Unknown Zone";
      stats[zone] = (stats[zone] || 0) + 1;
    });
    return Object.entries(stats).sort((a, b) => b[1] - a[1]);
  }, [data]);

  // 2. Calculate Officer Stats (Total)
  const officerStats = useMemo(() => {
    const stats = {};
    data.forEach(sub => {
      const officer = sub.zonal_officer_name || "Unknown Officer";
      stats[officer] = (stats[officer] || 0) + 1;
    });
    return Object.entries(stats).sort((a, b) => b[1] - a[1]);
  }, [data]);

  // 3. Calculate Daily Stats per Officer
  const dailyOfficerStats = useMemo(() => {
    const stats = {};
    data.forEach(sub => {
      const officer = sub.zonal_officer_name || "Unknown Officer";
      const rawDate = sub.date_of_assessment || "Unknown Date";
      const date = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;

      const key = `${officer}|${date}`;
      if (!stats[key]) {
        stats[key] = { officer, date, count: 0 };
      }
      stats[key].count += 1;
    });

    return Object.values(stats).sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return a.officer.localeCompare(b.officer);
    });
  }, [data]);

  // 4. Calculate Daily Stats per Enumerator (Person)
  const dailyPersonStats = useMemo(() => {
    const stats = {};
    data.forEach(sub => {
      const person = sub.submitted_by || "Unknown Enumerator";
      const rawDate = sub.date_of_assessment || "Unknown Date";
      const date = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;

      const key = `${person}|${date}`;
      if (!stats[key]) {
        stats[key] = { person, date, count: 0 };
      }
      stats[key].count += 1;
    });

    return Object.values(stats).sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return a.person.localeCompare(b.person);
    });
  }, [data]);

  const maxZoneCount = Math.max(...zoneStats.map(s => s[1]), 1);
  const maxOfficerCount = Math.max(...officerStats.map(s => s[1]), 1);

  // Reusable table row style
  const tableRowStyle = (index) => ({
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: index % 2 === 0 ? 'white' : '#fcfcfc'
  });

  // Reusable badge style
  const badgeStyle = {
    backgroundColor: '#ebf8ff',
    color: '#2b6cb0',
    padding: '4px 8px',
    borderRadius: '12px',
    fontWeight: 'bold',
    fontSize: '12px',
    display: 'inline-block'
  };

  return (
    <div style={{ paddingBottom: '20px' }}>
      <h2 style={{ marginTop: 0, color: '#2c3e50' }}>Dashboard Analytics</h2>

      {/* ZONE WISE BAR CHART */}
      <div style={{ marginBottom: '30px' }}>
        <h3 style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '5px' }}>Zone-wise Completion</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '15px' }}>
          {zoneStats.map(([zone, count]) => (
            <div key={zone} style={{ display: 'flex', alignItems: 'center', fontSize: '13px' }}>
              <div style={{ width: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={zone}>{zone}</div>
              <div style={{ flex: 1, backgroundColor: '#e2e8f0', height: '20px', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${(count / maxZoneCount) * 100}%`, backgroundColor: '#3498db', height: '100%' }}></div>
              </div>
              <div style={{ width: '40px', textAlign: 'right', fontWeight: 'bold' }}>{count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* OFFICER WISE BAR CHART */}
      <div style={{ marginBottom: '30px' }}>
        <h3 style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '5px' }}>Officer-wise Total Completion</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '15px' }}>
          {officerStats.map(([officer, count]) => (
            <div key={officer} style={{ display: 'flex', alignItems: 'center', fontSize: '13px' }}>
              <div style={{ width: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={officer}>{officer}</div>
              <div style={{ flex: 1, backgroundColor: '#e2e8f0', height: '20px', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${(count / maxOfficerCount) * 100}%`, backgroundColor: '#2ecc71', height: '100%' }}></div>
              </div>
              <div style={{ width: '40px', textAlign: 'right', fontWeight: 'bold' }}>{count}</div>
            </div>
          ))}
        </div>
      </div>

      {/* DAILY PERFORMANCE BY OFFICER TABLE */}
      <div style={{ marginBottom: '30px' }}>
        <h3 style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '5px' }}>Daily Surveys per Officer</h3>
        <div style={{ maxHeight: '300px', overflowY: 'auto', marginTop: '15px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f9fa', zIndex: 1 }}>
              <tr>
                <th style={{ padding: '10px', borderBottom: '2px solid #cbd5e1' }}>Date</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #cbd5e1' }}>Officer Name</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #cbd5e1', textAlign: 'center' }}>Surveys Completed</th>
              </tr>
            </thead>
            <tbody>
              {dailyOfficerStats.map((stat, index) => (
                <tr key={`officer-${index}`} style={tableRowStyle(index)}>
                  <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#4a5568' }}>{stat.date}</td>
                  <td style={{ padding: '8px 10px' }}>{stat.officer}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <span style={badgeStyle}>{stat.count}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW: DAILY PERFORMANCE BY ENUMERATOR (PERSON) TABLE */}
      <div>
        <h3 style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '5px' }}>Daily Surveys per Enumerator</h3>
        <div style={{ maxHeight: '300px', overflowY: 'auto', marginTop: '15px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8f9fa', zIndex: 1 }}>
              <tr>
                <th style={{ padding: '10px', borderBottom: '2px solid #cbd5e1' }}>Date</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #cbd5e1' }}>Enumerator (Submitted By)</th>
                <th style={{ padding: '10px', borderBottom: '2px solid #cbd5e1', textAlign: 'center' }}>Surveys Completed</th>
              </tr>
            </thead>
            <tbody>
              {dailyPersonStats.map((stat, index) => (
                <tr key={`person-${index}`} style={tableRowStyle(index)}>
                  <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#4a5568' }}>{stat.date}</td>
                  <td style={{ padding: '8px 10px' }}>{stat.person}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <span style={{...badgeStyle, backgroundColor: '#e6fffa', color: '#319795'}}>{stat.count}</span>
                  </td>
                </tr>
              ))}
              {dailyPersonStats.length === 0 && (
                <tr>
                  <td colSpan="3" style={{ padding: '20px', textAlign: 'center', color: '#a0aec0' }}>No data available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

export default Analytics;