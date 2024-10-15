import React from 'react';
import './ItemDetails.css';

function ItemDetails({ item, onClose }) {
  const renderValue = (value) => {
    if (typeof value === 'object' && value !== null) {
      if ('_lat' in value && '_long' in value) {
        return `Latitude: ${value._lat}, Longitude: ${value._long}`;
      }
      return JSON.stringify(value);
    }
    return value;
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>{item.item.attributes.name || `${item.category} Details`}</h2>
        <ul>
          {Object.entries(item.item.attributes).map(([key, value]) => (
            <li key={key}>
              <strong>{key}:</strong> {renderValue(value)}
            </li>
          ))}
        </ul>
        <button onClick={onClose} className="close-button">Close</button>
      </div>
    </div>
  );
}

export default ItemDetails;