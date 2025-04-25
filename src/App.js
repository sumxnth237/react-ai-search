import React, { useState } from 'react';
import './App.css';
import { handlePrompt } from './chatbotLogic';
import ItemDetails from './itemdetails';

function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);

  const sendMessage = async () => {
    if (input.trim() === '') return;
    setMessages([...messages, { text: input, sender: 'user' }]);
    setInput('');
    try {
      const response = await handlePrompt(input);
      const highestSimilarityItem = response.items.length > 0 
        ? response.items.reduce((prev, current) => (prev.similarity > current.similarity) ? prev : current)
        : null;
      setMessages(prev => [...prev, {
        text: response.message,
        sender: 'bot',
        highestSimilarityItem: highestSimilarityItem
      }]);
    } catch (error) {
      console.error('Error handling prompt:', error);
      setMessages(prev => [...prev, { text: 'Failed to get response. Please try again.', sender: 'bot' }]);
    }
  };

  const showItemDetails = (item) => {
    setSelectedItem(item);
  };

  const closeItemDetails = () => {
    setSelectedItem(null);
  };

  return (
    <div className="App">
      <h1 className="app-title">ARVO: D Personal Assistant</h1>
      <div className="chat-container">
        <div className="messages">
          {messages.map((message, index) => (
            <div key={index} className={`message ${message.sender}`}>
              <p>{message.text}</p>
              {message.highestSimilarityItem && (
                <button 
                  onClick={() => showItemDetails(message.highestSimilarityItem)}
                  className="show-details-button"
                >
                  Show Details
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="input-area">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type your message..."
          />
          <button onClick={sendMessage}>Send</button>
        </div>
      </div>
      {selectedItem && (
        <ItemDetails item={selectedItem} onClose={closeItemDetails} />
      )}
    </div>
  );
}

export default App;