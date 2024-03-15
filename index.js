
const express = require("express");
const session = require('express-session');
const axios = require('axios');
const levenshtein = require('fastest-levenshtein');
const qrcode = require('qrcode');
const { Client } = require('whatsapp-web.js');
const fs = require('fs');


const path = require('path');


const app = express();

// Session middleware setup
app.use(session({
    secret: 'azbykkfgfgk',
    resave: false,
    saveUninitialized: true
}));

const states_of_india = [
    'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh', 'goa', 'gujarat', 'haryana',
    'himachal pradesh', 'jammu and kashmir', 'jharkhand', 'karnataka', 'kerala', 'madhya pradesh', 'maharashtra',
    'manipur', 'meghalaya', 'mizoram', 'nagaland', 'odisha', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu', 'telangana',
    'tripura', 'uttar pradesh', 'uttarakhand', 'west bengal', 'andaman and nicobar islands', 'chandigarh', 'dadra and nagar haveli',
    'daman and diu', 'delhi', 'lakshadweep', 'puducherry'
];

const disabilities = [
    'Blindness', 'Low Vision', 'Leprosy Cured persons', 'Hearing Impairment (deaf and hard of hearing)', 'Locomotor Disability',
    'Dwarfism', 'Intellectual Disability', 'Mental Illness', 'Autism Spectrum Disorder', 'Cerebral Palsy', 'Muscular Dystrophy',
    'Chronic Neurological conditions', 'Specific Learning Disabilities', 'Multiple Sclerosis', 'Speech and Language disability',
    'Thalassemia', 'Hemophilia', 'Sickle Cell disease', 'Multiple Disabilities including deafblindness', 'Acid Attack victim',
    'Parkinson\'s disease'
];

const client = new Client();

client.on('ready', () => {
    console.log('Client is ready!');
});

// Function to generate and save QR code to a file
const generateQRCode = async qr => {
    try {
        const qrPNG = await qrcode.toDataURL(qr);
        const base64Data = qrPNG.replace(/^data:image\/png;base64,/, "");
        fs.writeFileSync('./image.png', base64Data, 'base64');
        console.log("QR Code has been written to image.png");
    } catch (err) {
        console.error(err);
    }
};

client.on('qr', qr => {
    generateQRCode(qr);
});

const closestMatch = (str, choices) => {
    let bestMatch = choices[0];
    let bestDistance = levenshtein.distance(str, bestMatch);

    for (let i = 1; i < choices.length; i++) {
        const distance = levenshtein.distance(str, choices[i]);
        if (distance < bestDistance) {
            bestMatch = choices[i];
            bestDistance = distance;
        }
    }

    return [bestMatch, 1 - bestDistance / Math.max(str.length, bestMatch.length)];
};

// Initialize an empty session store
const sessionStore = new Map();

client.on('message_create', async (message) => {
    try {
        // Check if the message is sent by the bot itself
        if (message.fromMe) {
            return; // Ignore messages sent by the bot
        }

        console.log("start");

        // Retrieve or initialize session data from sessionStore
        let sessionData = sessionStore.get(message.from) || { user_data: [], greeted: false };
        console.log(sessionData)

        const msg = message.body.toLowerCase();

        if (!sessionData.greeted) {
            if (msg.includes('hello') || msg.includes('hi')) {
                sessionData.greeted = true;
                sessionData.user_data=[];
                console.log("first");
                client.sendMessage(message.from, "Hello! This is jankari bot. Please enter your state name.");
            } else {
                client.sendMessage(message.from, "Invalid input. Please say 'hello' or 'hi' to start.");
            }
        } else if (sessionData.user_data.length === 0) {
            const [state, stateRating] = closestMatch(msg, states_of_india);
            console.log("second")
            if (stateRating >= 0.8) {
                sessionData.user_data.push(state);
                client.sendMessage(message.from, "Thank you for providing your state. Now, please enter your gender.");
            } else {
                client.sendMessage(message.from, "This is not a valid state name. Please try again.");
            }
        } else if (sessionData.user_data.length === 1) {
            if (['male', 'female', 'transgender'].includes(msg)) {
                sessionData.user_data.push(msg.charAt(0).toUpperCase() + msg.slice(1));
                client.sendMessage(message.from, "Thank you for providing your gender. Now, please give the name of the disability.");
            } else {
                client.sendMessage(message.from, "Gender is not correct. Please give it again.");
            }
        } else if (sessionData.user_data.length === 2) {
            const [disability, disabilityRating] = closestMatch(msg, disabilities);
            if (disabilityRating >= 0.7) {
                sessionData.user_data.push(disability);
                client.sendMessage(message.from, "Now please provide how much percent disabilities you have.");
            } else {
                client.sendMessage(message.from, "Disability name is not correct. Please give it again.");
            }
        } else if (sessionData.user_data.length === 3) {
            const percent = parseFloat(msg);
            if (!isNaN(percent)) {
                sessionData.user_data.push(percent);
                client.sendMessage(message.from, "Now please provide, how much is your annual income.");
            } else {
                client.sendMessage(message.from, "Please provide a numerical value.");
            }
        } else if (sessionData.user_data.length === 4) {
            const income = parseFloat(msg);

            if (!isNaN(income)) {
                sessionData.user_data.push(income);
                try {
                    const response = await axios.post('http://127.0.0.1:5000/sms', {
                        user_details: sessionData.user_data
                    });

                    if (response.status !== 200) {
                        throw new Error('Network response was not ok');
                    }

                    let data = response.data;
                    console.log(data);

                    if (data) {
                        client.sendMessage(message.from , data)
                    } else {
                        client.sendMessage(message.from, "No schemes found for the provided data.");
                    }
                    sessionData.greeted = false;
                    sessionData.user_data=[];
                } catch (error) {
                    console.error('Error:', error);
                }

            } else {
                client.sendMessage(message.from, "Please provide a numerical value for your income.");
            }
            
        }

        // Save updated session data back to sessionStore
        sessionStore.set(message.from, sessionData);
        
    } catch (err) {
        console.error('Error processing data:', err);
        client.sendMessage(message.from, 'An error occurred while processing the data.');
    }
});


// Assuming the image is saved in the root directory
const imagePath = path.resolve(__dirname, '..', 'image.png');

app.get('/', (req, res) => {
    // Send the QR code data to the client
    res.sendFile(imagePath);
});

client.initialize();

const PORT = 9000
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);

});

