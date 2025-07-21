// server.js

const express = require('express');
const cors = require('cors');
const OktaJwtVerifier = require('@okta/jwt-verifier'); // Import the Okta JWT Verifier
const app = express();
const PORT = 3002;

// --- CONFIGURE THESE FOR OKTA JWT VERIFIER ---
const OKTA_ORG_URL = 'https://kiosko-trial.oktapreview.com'; // Your Okta Org URL (same as client)
const OKTA_AUTH_SERVER_ID = 'default'; // Or your custom auth server ID (same as client)
const OKTA_CLIENT_ID = '0oao2c0zc4MNK67Nb1d7'; // Client ID of your SPA app (same as client)
const API_AUDIENCE = 'api://default'; // This should match the Audience of your Access Token.
                                     // For the 'default' Authorization Server, it's often 'api://default'
                                     // or the value configured in your Okta API Gateway/Auth Server settings.
                                     // If you created a custom API in Okta, it's usually the API's Audience URI.
// --- END OKTA JWT VERIFIER CONFIGURATION ---

// Initialize the Okta JWT Verifier
const oktaJwtVerifier = new OktaJwtVerifier({
    issuer: `${OKTA_ORG_URL}/oauth2/${OKTA_AUTH_SERVER_ID}`,
    clientId: OKTA_CLIENT_ID, // Although not strictly required for JWT verification, good practice to include
    assertClaims: {
        aud: API_AUDIENCE, // Ensure the token's audience matches your API's expected audience
    }
});

// --- CORS Configuration ---
const corsOptions = {
    origin: 'http://localhost:3001', // Allow requests only from your frontend URL
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};
app.use(cors(corsOptions));
app.use(express.json()); // Middleware to parse JSON request bodies

// --- Okta Authentication Middleware ---
// This middleware will validate the Access Token for protected routes
async function authenticateOktaToken(req, res, next) {
    console.log('--- Inside authenticateOktaToken middleware ---');
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('Authentication failed: No Authorization header or malformed.');
        return res.status(401).json({ status: 'error', message: 'Unauthorized: Bearer token missing or malformed' });
    }

    const accessToken = authHeader.split(' ')[1];

    try {
        // Verify the token
        // The expected audience ('aud') must match the audience claim in the token.
        // The expected scope can be an array of scopes, where the token must have *at least one* of them.
        const jwt = await oktaJwtVerifier.verifyAccessToken(accessToken, API_AUDIENCE); // Pass API_AUDIENCE here

        // Check for specific scope required for this sensitive transaction
        const requiredScope = 'transactions:write';
        if (!jwt.claims.scp || !jwt.claims.scp.includes(requiredScope)) {
            console.warn(`Authentication failed: Missing required scope '${requiredScope}'. Token scopes:`, jwt.claims.scp);
            return res.status(403).json({ status: 'error', message: `Forbidden: Missing required scope '${requiredScope}'` });
        }

        req.jwt = jwt; // Attach the decoded JWT to the request for later use
        console.log('Access Token verified successfully. Claims:', jwt.claims);
        next(); // Proceed to the next middleware or route handler
    } catch (error) {
        console.error('Access Token verification failed:', error.message);
        return res.status(401).json({ status: 'error', message: `Unauthorized: Invalid token - ${error.message}` });
    }
}

// --- API Endpoint: Perform Sensitive Transaction ---
// Apply the authentication middleware ONLY to this sensitive endpoint
app.post('/api/perform-sensitive-transaction', authenticateOktaToken, (req, res) => {
    console.log('--- Received Request to /api/perform-sensitive-transaction (after authentication) ---');
    console.log('Request Body:', req.body);
    // console.log('Authorization Header (not logging full token for security):', req.headers.authorization ? 'Present' : 'Missing');

    // Access the verified JWT claims from req.jwt
    const userId = req.jwt.claims.sub; // 'sub' claim usually contains the user ID
    const userEmail = req.jwt.claims.email; // 'email' claim if included in token
    const tokenScopes = req.jwt.claims.scp; // Scopes granted in the token

    console.log(`Transaction initiated by User ID: ${userId}, Email: ${userEmail}`);
    console.log(`Token Scopes: ${tokenScopes.join(', ')}`);


    const transactionData = req.body;

    if (!transactionData || !transactionData.productId || !transactionData.quantity) {
        return res.status(400).json({
            status: 'error',
            message: 'Invalid transaction data. Missing productId or quantity.'
        });
    }

    // Simulate processing the transaction
    const transactionId = `txn_${Date.now()}`;
    const responseMessage = `Transaction ${transactionId} processed successfully for product ${transactionData.productId}.`;

    console.log('--- Responding with Success ---');
    res.status(200).json({
        status: 'success',
        message: responseMessage,
        transactionId: transactionId,
        receivedData: transactionData,
        // Include some details from the token for demonstration
        initiatedBy: {
            userId: userId,
            email: userEmail,
            scopes: tokenScopes
        }
    });
});

// --- Basic Root Endpoint (Optional) ---
app.get('/', (req, res) => {
    res.send('Okta API Service is running!');
});

// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`API Server is running on http://localhost:${PORT}`);
    console.log(`Frontend should be at http://localhost:3001`);
    console.log(`Make sure your Okta Authorization Server configuration (issuer, audience, scopes) matches!`);
});