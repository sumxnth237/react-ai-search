// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
import { getFirestore } from 'firebase/firestore';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCmUs1uxjd5Yucs1haoKOffXmEsTd8qfYA",
  authDomain: "ai-search-e9b22.firebaseapp.com",
  projectId: "ai-search-e9b22",
  storageBucket: "ai-search-e9b22.appspot.com",
  messagingSenderId: "310915832674",
  appId: "1:310915832674:web:473e4c2054742e0b782a3b",
  measurementId: "G-KRLBWC3X5E"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);

const db = getFirestore(app);

export { db };