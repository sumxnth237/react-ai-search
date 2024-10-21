import React, { useState } from 'react';
import './Calendar.css'; // Make sure to import the CSS styles

const getMonthDays = () => {
  const today = new Date();
  const monthDays = [];
  const year = today.getFullYear();
  const month = today.getMonth();

  // Get the number of days in the current month
  const totalDays = new Date(year, month + 1, 0).getDate();

  for (let i = 1; i <= totalDays; i++) {
    monthDays.push(i); // Store only the day (number)
  }

  return monthDays;
};

const WeeklyCalendar = () => { // Keeping the name unchanged
  const [tasks, setTasks] = useState({});
  const monthDays = getMonthDays();
  const [currentMonth] = useState(new Date().toLocaleString('default', { month: 'long', year: 'numeric' }));

  const handleAddTask = (day) => {
    const dateStr = `${day} ${currentMonth}`;
    const task = prompt(`Enter task for ${dateStr}:`);
    if (task) {
      setTasks((prevTasks) => {
        const newTasks = {
          ...prevTasks,
          [dateStr]: [...(prevTasks[dateStr] || []), task],
        };
        console.log('Updated tasks:', newTasks); // Log the updated tasks
        return newTasks;
      });
    }
  };

  const checkTasksForDay = (date) => {
    const dayTasks = tasks[date] || [];
    if (dayTasks.length > 0) {
      return `Tasks for ${date}: ${dayTasks.join(', ')}`;
    } else {
      return `No tasks found for ${date}.`;
    }
  };

  const handleCheckTasks = () => {
    const dateToCheck = prompt("Enter the date to check tasks (e.g., '22 October 2024'):");
    if (dateToCheck) {
      alert(checkTasksForDay(dateToCheck));
    }
  };

  return (
    <div className="datepicker">
      <div className="datepicker-top">

        <div className="month-selector">
          {/* <button className="arrow"><i className="material-icons">chevron_left</i></button> */}
          <span className="month-name">{currentMonth}</span>
          {/* <button className="arrow"><i className="material-icons">chevron_right</i></button> */}
        </div>
      </div>
      <div className="datepicker-calendar">
        <span className="day">Mo</span>
        <span className="day">Tu</span>
        <span className="day">We</span>
        <span className="day">Th</span>
        <span className="day">Fr</span>
        <span className="day">Sa</span>
        <span className="day">Su</span>
        {monthDays.map((day) => (
          <button 
            key={day} 
            className="date" 
            onClick={() => handleAddTask(day)}
          >
            {day}
          </button>
        ))}
      </div>
    </div>
  );
};

export default WeeklyCalendar;
