// index.js (or app.js)
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;

// Middleware to parse JSON request bodies
app.use(bodyParser.json());

// This helper function is no longer strictly necessary in this form
// because URLSearchParams.forEach and URLSearchParams.entries
// can directly provide key-value pairs.
// However, if you had complex parsing logic for individual params,
// you might keep a modified version. For now, we'll simplify.
// function parseComponents(currentItem, memo = {}) {
//     const parts = currentItem.split('=');
//     const key = parts[0];
//     const value = parts[1] || "";
//     memo[key] = value;
//     return memo;
// }

// --- Main API Endpoint (simulating "Demo Inline Hook") ---
// Purpose: This is the primary API endpoint that would receive the
// Okta Token/Claims Inline Hook payload.
app.post('/okta-inline-hook', (req, res) => {
    const hookPayload = req.body;

    let rawUrl = '';
    try {
        rawUrl = hookPayload.data.context.request.url.value;
    } catch (error) {
        console.error("Could not extract URL from payload:", error);
        return res.status(400).json({
            commands: [],
            status: "ERROR",
            error: "Invalid payload format: 'data.context.request.url.value' missing."
        });
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(rawUrl);
    } catch (error) {
        console.error("Could not parse URL:", error);
        return res.status(400).json({
            commands: [],
            status: "ERROR",
            error: "Invalid URL provided in payload."
        });
    }

    // Instead of splitting and reducing manually, directly use parsedUrl.searchParams
    const queryParams = parsedUrl.searchParams;

    // Prepare an array to hold the dynamic claims
    const dynamicClaims = [];

    // Iterate over all query parameters and add them as claims
    // The `URLSearchParams` object has an `entries()` method that returns an iterator
    // of `[key, value]` pairs, which is perfect for this.
    for (const [key, value] of queryParams.entries()) {
        // You might want to add a prefix to avoid clashes with existing Okta claims
        // or filter out certain internal parameters if they exist in the URL
        if (key && value) { // Ensure both key and value exist
            dynamicClaims.push({
                op: "add",
                path: `/claims/${key}`, // Use the extraParam key directly as the claim name
                value: value
            });
        }
    }

    // Simulate 'string:compose' card: Construct the Okta Inline Hook response JSON.
    const responseBody = {
        commands: [
            {
                type: "com.okta.identity.patch",
                value: [
                    {
                        op: "add",
                        path: "/claims/hookdemo",
                        value: "Hook rocks!" // Static value from workflow's compose card
                    }
                ]
            },
            {
                type: "com.okta.access.patch",
                value: dynamicClaims // Dynamically generated claims
            }
        ]
    };

    res.status(200).json(responseBody);
});

// Start the server
app.listen(port, () => {
    console.log(`API service listening at http://localhost:${port}`);
});