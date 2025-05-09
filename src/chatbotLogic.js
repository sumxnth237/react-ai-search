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
    const response = await fetch(
      "https://api-inference.huggingface.co/models/facebook/bart-base",
      {
          method: "POST",
          headers: {
              Authorization: `Bearer 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`,
              "Content-Type": "application/json"
          },
          body: JSON.stringify({inputs: text}),
      }
  );

  const result = await response.json();
  // console.log(result);
  
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
            content: 'You are an AI trained to extract attributes from text. Extract relevant attributes as a valid JSON object with no additional text before or after. For example: {"color": "red", "size": "large"}. If an attribute is not present, omit it from the response.'
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

    // More aggressive cleaning of the response
    content = content.replace(/```(json)?|```/g, '').trim();
    
    // Find JSON object pattern - match everything between { and }
    const jsonMatch = content.match(/\{(.|\n)*\}/);
    if (jsonMatch) {
      content = jsonMatch[0];
    }

    try {
      return JSON.parse(content);
    } catch (parseError) {
      console.error('Error parsing JSON:', parseError, 'Content:', content);
      
      // Return a simple object with the original text as a fallback
      return { query: prompt };
    }
  } catch (error) {
    console.error('Error extracting attributes:', error);
    return { query: prompt };
  }
}

// Function to calculate cosine similarity between two vectors
// Updated cosineSimilarity function to handle the new embedding format
function cosineSimilarity(vec1, vec2) {
  try {
    // Handle the nested array format
    // The embeddings from facebook/bart-base might have a specific structure
    
    // Extract the actual embedding vectors
    const extractVector = (v) => {
      if (!v) return null;
      
      // If it's already a flat array of numbers, use it directly
      if (Array.isArray(v) && typeof v[0] === 'number') {
        return v;
      }
      
      // If it's an array of arrays, flatten it to get the embedding values
      if (Array.isArray(v) && Array.isArray(v[0])) {
        // This gets the first hidden state or "last_hidden_state" if that's what the model returns
        return v[0].flat();
      }
      
      // For facebook/bart-base, the structure might be more complex
      // Check for common embedding properties in the response
      if (v.last_hidden_state) {
        return Array.isArray(v.last_hidden_state) ? v.last_hidden_state.flat() : v.last_hidden_state;
      }
      
      // If all else fails, try to convert the object to a flat array of values
      if (typeof v === 'object' && !Array.isArray(v)) {
        return Object.values(v).flat();
      }
      
      console.error('Could not extract vector from:', v);
      return null;
    };
    
    const flatVec1 = extractVector(vec1);
    const flatVec2 = extractVector(vec2);
    
    if (!flatVec1 || !flatVec2) {
      console.error('Invalid vectors for similarity calculation');
      return 0;
    }
    
    console.log('Vector 1 length:', flatVec1.length);
    console.log('Vector 2 length:', flatVec2.length);
    
    // Get the minimum length to compare (in case vectors have different dimensions)
    const minLength = Math.min(flatVec1.length, flatVec2.length);
    
    // Calculate cosine similarity using the available dimensions
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;
    
    for (let i = 0; i < minLength; i++) {
      dotProduct += flatVec1[i] * flatVec2[i];
      mag1 += flatVec1[i] * flatVec1[i];
      mag2 += flatVec2[i] * flatVec2[i];
    }
    
    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);
    
    if (mag1 === 0 || mag2 === 0) {
      console.warn('Zero magnitude vector detected');
      return 0;
    }
    
    const similarity = dotProduct / (mag1 * mag2);
    return similarity;
  } catch (error) {
    console.error('Error calculating similarity:', error);
    return 0;
  }
}

// Function to find matching items in the Firestore database using embeddings
// Updated findMatchingItems function with better debugging and error handling
async function findMatchingItems(attributes) {
  const matches = [];
  
  const attributesEntries = Object.entries(attributes);
  if (attributesEntries.length === 0) {
    console.error('No valid attributes found');
    return matches;
  }
  
  const attributesText = attributesEntries.map(([key, value]) => `${key}: ${value}`).join(', ');
  console.log('Attributes text:', attributesText);
  
  // Get the query embedding
  let attributesEmbedding;
  try {
    attributesEmbedding = await getEmbedding(attributesText);
    console.log('Query embedding obtained successfully. Format:', typeof attributesEmbedding);
    
    if (!attributesEmbedding) {
      console.error('Failed to get embedding for attributes');
      return matches;
    }
  } catch (error) {
    console.error('Error getting embedding for attributes:', error);
    return matches;
  }

  // Define collections to search
  const collections = ['jobs', 'items', 'events', 'shops', 'services'];
  // Prioritize the matching collection type if specified
  if (attributes.type) {
    const matchingCollections = collections.filter(c => 
      attributes.type.toLowerCase().includes(c.slice(0, -1)) || // Handle singular forms
      c.slice(0, -1).includes(attributes.type.toLowerCase())    // Handle partial matches
    );
    
    if (matchingCollections.length > 0) {
      console.log('Prioritizing collections:', matchingCollections);
      // Reorder to search matching collections first
      collections.sort((a, b) => 
        matchingCollections.includes(a) ? -1 : 
        matchingCollections.includes(b) ? 1 : 0
      );
    }
  }
  
  // Process each collection
  for (const category of collections) {
    try {
      const items = await getCollectionData(category);
      console.log(`${category} items:`, items.length);

      if (!items || items.length === 0) continue;

      // Process each item in the collection
      for (const item of items) {
        // Skip items without attributes
        if (!item.attributes) {
          console.log(`Skipping item in ${category} without attributes`);
          continue;
        }
        
        // Create a text representation of the item's attributes
        const itemText = Object.entries(item.attributes)
          .filter(([_, value]) => value) // Filter out null/undefined values
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        
        if (!itemText) {
          console.log(`Skipping item in ${category} with empty attributes text`);
          continue;
        }
        
        // Get embedding for this item
        let itemEmbedding;
        try {
          itemEmbedding = await getEmbedding(itemText);
          
          if (!itemEmbedding) {
            console.log(`Failed to get embedding for item in ${category}`);
            continue;
          }
        } catch (error) {
          console.error(`Error getting embedding for item in ${category}:`, error);
          continue;
        }
        
        // Calculate similarity
        let similarity = 0;
        try {
          similarity = cosineSimilarity(attributesEmbedding, itemEmbedding);
          
          // Log high similarity matches for debugging
          if (similarity > 0.5) {
            console.log(`High similarity match (${similarity.toFixed(3)}) in ${category}:`, itemText);
          }
        } catch (error) {
          console.error(`Error calculating similarity for item in ${category}:`, error);
          continue;
        }
        
        // Adjust similarity based on additional factors
        let adjustedSimilarity = similarity;
        
        // Boost similarity for category matches
        if (attributes.type) {
          const categoryBoost = 
            category.toLowerCase().includes(attributes.type.toLowerCase()) || 
            attributes.type.toLowerCase().includes(category.slice(0, -1).toLowerCase()) ? 
            0.2 : 0;
          
          adjustedSimilarity += categoryBoost;
        }
        
        // Apply color matching boost
        if (attributes.color && item.attributes.color && 
            attributes.color.toLowerCase() === item.attributes.color.toLowerCase()) {
          adjustedSimilarity += 0.15;
        }

        // Apply distance-based adjustment if applicable
        if (['shops', 'events', 'jobs'].includes(category) && item.distance !== undefined) {
          const maxDistance = attributes.distance ? parseFloat(attributes.distance) : 10; // Default 10km
          if (item.distance <= maxDistance) {
            adjustedSimilarity += 0.1;
          } else {
            adjustedSimilarity -= 0.05;
          }
        }

        // Lowered threshold for matches due to potential embedding differences
        if (adjustedSimilarity > 0.6) { // Lower threshold to catch more potential matches
          matches.push({ 
            category, 
            item, 
            similarity: adjustedSimilarity, 
            distance: item.distance,
            originalSimilarity: similarity // Keep the original similarity for debugging
          });
          
          console.log(`Added match with adjusted similarity ${adjustedSimilarity.toFixed(3)} (original: ${similarity.toFixed(3)})`);
        }
      }
    } catch (error) {
      console.error(`Error processing ${category}:`, error);
    }
  }

  console.log('Total matches found:', matches.length);
  
  // If we have matches, log the details of the top matches
  if (matches.length > 0) {
    console.log('Top 3 matches:', matches.slice(0, 3).map(m => ({
      category: m.category,
      similarity: m.similarity.toFixed(3),
      originalSimilarity: m.originalSimilarity.toFixed(3),
      distance: m.distance,
      attributes: m.item.attributes
    })));
  }
  
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
  
  try {
    // Extract attributes from the prompt
    const attributes = await extractAttributes(prompt);
    console.log('Extracted attributes:', attributes);

    if (!attributes || Object.keys(attributes).length === 0) {
      return {
        message: "I couldn't understand your request. Could you please provide more details?",
        items: [],
      };
    }

    // Find matching items
    const matchingItems = await findMatchingItems(attributes);
    console.log('Matching items:', matchingItems.length);

    // If no matches were found
    if (matchingItems.length === 0) {
      // Try with a simpler search
      console.log('No matches found, trying with simpler attributes');
      
      // Create simplified attributes focusing on the most important ones
      const simplifiedAttributes = {};
      if (attributes.type) simplifiedAttributes.type = attributes.type;
      if (attributes.color) simplifiedAttributes.color = attributes.color;
      
      // Add the raw query as a type attribute to increase chances of matching
      simplifiedAttributes.query = prompt;
      
      // Try again with simplified attributes
      const simpleMatches = await findMatchingItems(simplifiedAttributes);
      console.log('Simple matches found:', simpleMatches.length);
      
      if (simpleMatches.length === 0) {
        return {
          message: `I couldn't find any items matching "${prompt}" in our database. Could you try a more general search?`,
          items: [],
        };
      }
      
      // Process the simple matches
      const groqResponse = await processWithGroq(prompt, simplifiedAttributes, simpleMatches);
      
      return {
        message: groqResponse,
        items: simpleMatches.slice(0, 3),
      };
    }

    // Process with GROQ using the found matches
    const groqResponse = await processWithGroq(prompt, attributes, matchingItems);

    return {
      message: groqResponse,
      items: matchingItems.slice(0, 3), // Return top 3 matches
    };
  } catch (error) {
    console.error('Error handling prompt:', error);
    return {
      message: "I encountered a technical issue while processing your request. Please try again with a simpler query.",
      items: [],
      error: true
    };
  }
}
