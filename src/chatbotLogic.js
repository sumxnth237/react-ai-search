import { HfInference } from '@huggingface/inference';
import axios from 'axios';
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebaseConfig";

const USER_LAT = 13.041820;
const USER_LON = 77.528481;

// Initialize Hugging Face inference
const hf = new HfInference(process.env.REACT_APP_HUGGINGFACE_API_KEY);

// Get the GROQ API key from environment variables
const groqApiKey = process.env.REACT_APP_GROQ_API_KEY;

// Function to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in kilometers
}

// Function to fetch collection data from Firestore
async function getCollectionData(collectionName) {
    try {
      const querySnapshot = await getDocs(collection(db, collectionName));
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        if (['shops', 'events', 'jobs'].includes(collectionName) && data.attributes.latitude && data.attributes.longitude) {
          const distance = calculateDistance(USER_LAT, USER_LON, data.attributes.latitude, data.attributes.longitude);
          return { ...data, distance: distance.toFixed(2) };
        }
        return data;
      });
    } catch (error) {
      console.error(`Error fetching data from collection ${collectionName}:`, error);
      return [];
    }
  }
// Function to get embedding using Hugging Face
async function getEmbedding(text) {
  try {
    const result = await hf.featureExtraction({
      model: 'sentence-transformers/all-mpnet-base-v2',
      inputs: text,
    });
    return result;
  } catch (error) {
    console.error('Error getting embedding:', error);
    return null;
  }
}

// Function to extract attributes from prompt using NER via GROQ API
async function extractAttributes(prompt) {
  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'system',
            content:
              'You are an AI trained to extract attributes from text. Please extract relevant attributes such as color, size, type, material, condition, distance, and any other relevant features. The database has 5 collections: events, items, jobs, services, and shops; return these keywords too if present in the query. Return the result as a JSON object. If an attribute is not present, omit it from the response.',
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 150,
      },
      {
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    let content = response.data.choices[0].message.content.trim();

    // Strip markdown and prefix like "Here is your data:"
    content = content.replace(/```(json)?/g, '').trim();
    content = content.replace(/^Here[^:{]*:?/, '').trim();

    // Find where the last closing brace is, in case there's extra text
    const jsonEndIndex = content.lastIndexOf('}');
    if (jsonEndIndex !== -1) {
      content = content.substring(0, jsonEndIndex + 1);
    }

    // Try parsing clean content
    try {
      return JSON.parse(content);
    } catch (parseError) {
      console.error('Error parsing JSON:', parseError);

      // Fallback: manually extract key-value pairs
      const extractedAttributes = {};
      const pairs = content.match(/(\w+):\s*([^,\n]+)/g);
      if (pairs) {
        pairs.forEach(pair => {
          const [key, value] = pair.split(':').map(s => s.trim());
          if (value !== 'null' && value !== '') {
            extractedAttributes[key] = value.replace(/["']/g, '');
          }
        });
      }
      return extractedAttributes;
    }
  } catch (error) {
    console.error('Error extracting attributes:', error);
    return {};
  }
}

// Function to calculate cosine similarity between two vectors
function cosineSimilarity(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) {
    return 0;
  }
  const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
  const mag1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
  const mag2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (mag1 * mag2);
}

// Function to find matching items in the Firestore database using embeddings
async function findMatchingItems(attributes) {
  const matches = [];
  const attributesText = Object.entries(attributes).map(([key, value]) => `${key}: ${value}`).join(', ');
  console.log('Attributes text:', attributesText);
  const attributesEmbedding = await getEmbedding(attributesText);

  if (!attributesEmbedding) {
    console.error('Failed to get embedding for attributes');
    return matches;
  }

  const collections = ['jobs', 'items', 'events', 'shops', 'services'];
  for (const category of collections) {
    const items = await getCollectionData(category);
    console.log(`${category} items:`, items.length);

    if (items.length === 0) continue;

    for (const item of items) {
      const itemText = Object.entries(item.attributes).map(([key, value]) => `${key}: ${value}`).join(', ');
      const itemEmbedding = await getEmbedding(itemText);
      
      if (!itemEmbedding) {
        console.error(`Failed to get embedding for item in ${category}`);
        continue;
      }

      const similarity = cosineSimilarity(attributesEmbedding, itemEmbedding);
      
      // Boost similarity for category matches
      const categoryBoost = category.toLowerCase().includes(attributes.type?.toLowerCase()) ? 0.2 : 0;
      let adjustedSimilarity = similarity + categoryBoost;

      // Apply distance-based adjustment if applicable
      if (['shops', 'events', 'jobs'].includes(category) && item.distance !== undefined) {
        const maxDistance = attributes.distance ? parseFloat(attributes.distance) : Infinity;
        if (item.distance <= maxDistance) {
          // Boost similarity for items within the specified distance
          adjustedSimilarity += 0.1;
        } else {
          // Penalize items outside the specified distance
          adjustedSimilarity -= 0.1;
        }
      }

      if (adjustedSimilarity > 0.3) { // Lowered threshold
        matches.push({ category, item, similarity: adjustedSimilarity, distance: item.distance });
      }
    }
  }

  console.log('Total matches found:', matches.length);
  return matches.sort((a, b) => b.similarity - a.similarity);
}

  

// Function to process the query with GROQ API using the matched items
async function processWithGroq(prompt, attributes, matchingItems) {
  try {
    if (matchingItems.length === 0 || !matchingItems[0]) {
      return "I'm sorry, but I couldn't find any exact matches in our database for your query. Could you please provide more details or rephrase your request?";
    }
    
    const highestSimilarityItem = matchingItems[0];

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions', 
      {
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Provide detailed information based on the matching items from the database, including distance information when available.' },
          { role: 'user', content: `Prompt: ${prompt}\nAttributes: ${JSON.stringify(attributes)}\nHighest Similarity Item: ${JSON.stringify(highestSimilarityItem)}` },
          { role: 'user', content: 'Please provide a good response based on the matching items from our database. Tell it in a human readable manner and not in the form of key:value pairs in the way it is stored by computers. Also leave out similarity because that\'s for computer to understand and not for humans to know. Tell detailed information about the highest similarity thing only. Include distance information when available and mention the distance in kilometers everytime, not in longitudes/latitudes. Tell it short and sweet within 150 tokens.' }
        ],
        max_tokens: 150
      },
      {
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error('Error processing with GROQ:', error);
    return "I apologize, but I encountered an error while processing your request. Please try again later or rephrase your query.";
  }
}

// Main function to handle the entire process
export async function handlePrompt(prompt) {
  console.log('Handling prompt:', prompt);
  const attributes = await extractAttributes(prompt);
  console.log('Extracted attributes:', attributes);

  // Ensure the attributes are structured correctly before matching
  const matchingItems = await findMatchingItems(attributes);
  console.log('Matching items:', matchingItems.length);

  // Get the highest similarity item
  const highestSimilarityItem = matchingItems.length > 0 ? matchingItems[0] : null;
  
  // If no matches are found, provide a helpful response
  if (!highestSimilarityItem) {
    return {
      message: "I'm sorry, but I couldn't find any exact matches in our database for your query. Could you please provide more details or rephrase your request?",
      items: [],
    };
  }

  // Generate response based on the highest similarity item
  const groqResponse = await processWithGroq(prompt, attributes, [highestSimilarityItem]);

  return {
    message: groqResponse,
    items: [highestSimilarityItem], // Only return the highest similarity item
  };
}
