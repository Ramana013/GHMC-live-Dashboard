import React, { useEffect, useState } from 'react';
import { GeoJSON } from 'react-leaflet';

// Helper function to split MultiPolygon into individual Polygons
function multiPolygonToPolygons(multiPolygon) {
  if (multiPolygon.geometry.type !== 'MultiPolygon') return [multiPolygon];

  return multiPolygon.geometry.coordinates.map((coords, index) => ({
    type: "Feature",
    properties: { ...multiPolygon.properties, _splitIndex: index },
    geometry: {
      type: "Polygon",
      coordinates: coords
    }
  }));
}

const GeoJSONLayer = ({ url, styleOptions = {}, colorByZone = false }) => {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error("File not found");
        return response.json();
      })
      .then(data => setData(data))
      .catch(error => console.error("Error loading GeoJSON:", error));
  }, [url]);

  // Pre-defined array of distinct colors for Zones
  const zoneColors = {
    'Uppal': '#e6194b',
    'LB Nagar': '#3cb44b',
    'Secunderabad': '#4363d8',
    'Central': '#f58231',
    'South': '#911eb4',
    'West': '#46f0f0',
    'North': '#f032e6',
    'Default': '#808080'
  };

  const onEachFeature = (feature, layer) => {
    if (feature.properties) {
      let desc = feature.properties.Description || "";
      const getVal = (key) => {
        const regex = new RegExp(`<td>${key}</td>\\s*<td>([^<]+)</td>`, "i");
        const match = desc.match(regex);
        return match ? match[1].trim() : null;
      };

      const wardName = getVal("Ward_Name") || feature.properties.Name || "Unknown Ward";
      const zoneName = getVal("Zone_Name") || "Unknown Zone";

      // Show a clean popup with Ward and Zone
      layer.bindPopup(`<b>Ward:</b> ${wardName}<br/><b>Zone:</b> ${zoneName}`);

      layer.on({
        mouseover: (e) => {
          const layer = e.target;
          layer.setStyle({ weight: 3, color: '#333', fillOpacity: 0.5 });
        },
        mouseout: (e) => {
          const layer = e.target;
          layer.setStyle(styleOptions);
        }
      });
    }
  };

  if (!data) return null;

  const processedData = {
    ...data,
    features: data.features.flatMap(feature =>
      feature.geometry.type === 'MultiPolygon' ? multiPolygonToPolygons(feature) : [feature]
    )
  };

  return (
    <GeoJSON
      data={processedData}
      style={(feature) => {
        if (colorByZone) {
          // Extract Zone Name to color the polygon
          let desc = feature.properties.Description || "";
          const match = desc.match(/<td>Zone_Name<\/td>\s*<td>([^<]+)<\/td>/i);
          const zoneName = match ? match[1].trim() : "Default";

          return {
            fillColor: zoneColors[zoneName] || zoneColors['Default'],
            fillOpacity: 0.3,
            weight: 1,
            color: '#444',
            ...styleOptions
          };
        }

        // Default behavior (for the base wards layer)
        return {
          fillColor: 'transparent',
          fillOpacity: 0,
          weight: 1,
          color: '#999',
          ...styleOptions
        };
      }}
      onEachFeature={onEachFeature}
    />
  );
};

export default GeoJSONLayer;