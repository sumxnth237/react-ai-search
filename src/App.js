import React, { useState } from 'react';
import './App.css';
import { handlePrompt } from './chatbotLogic';
import ItemDetails from './ItemDetails';
import WeeklyCalendar from './WeeklyCalendar'; // Import the WeeklyCalendar component

function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false); // State to control calendar visibility

  const sendMessage = async () => {
    if (input.trim() === '') return;
    setMessages([...messages, { text: input, sender: 'user' }]);
    setInput('');
    try {
      const response = await handlePrompt(input);
      const highestSimilarityItem = response.items.length > 0 
        ? response.items.reduce((prev, current) => (prev.similarity > current.similarity) ? prev : current)
        : null;

      // Check if the response includes a request to show the calendar
      if (input.toLowerCase().includes("calendar")) {
        setShowCalendar(true); // Show the calendar
      } else {
        setShowCalendar(false); // Hide the calendar if the user input doesn't ask for it
      }

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
      <h1 className="app-title">Your Personalized Assistant</h1>
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
      {/* Conditionally render WeeklyCalendar based on showCalendar state */}
      {showCalendar && <WeeklyCalendar />}
    </div>
  );
}

export default App;
