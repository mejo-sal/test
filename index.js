// index.js

// Import libraries
const { Client, LocalAuth } = require('whatsapp-web.js'); // WhatsApp client
const qrcode = require('qrcode-terminal'); // For QR code in terminal
const express = require('express'); // Express server
const bodyParser = require('body-parser'); // To parse JSON body

// Initialize Express app
const app = express();
app.use(bodyParser.json()); // Enable JSON parsing

// Initialize WhatsApp client with session storage
const client = new Client({
    authStrategy: new LocalAuth(),
});

// Generate QR code in terminal if no session exists
client.on('qr', (qr) => {
    console.log('Scan this QR code to login:');
    qrcode.generate(qr, { small: true });
});

// Notify when WhatsApp is ready
client.on('ready', () => {
    console.log('WhatsApp bot is ready!');
});

// Start WhatsApp client
client.initialize();

// ---------- WEBHOOKS ----------

// 1️⃣ New Order Webhook
// 1️⃣ New Order Webhook
app.post('/webhook/new-order', async (req, res) => {
    try {
        const order = req.body.payload.order;
        const customerName = order.customer.name;
        const rawPhone = order.shippingAddress.phone.replace(/\D/g,''); // Remove symbols
        const customerPhone = `${rawPhone}`; // Add + for country code
        const message = `Hi ${customerName}, your order has been placed successfully!`;

        // Check if chat exists
        const chatId = await client.getNumberId(customerPhone).catch(() => null);
        if (!chatId) {
            console.log(`⚠️ WhatsApp number not found: ${customerPhone}`);
            return res.status(400).send(`Number not found on WhatsApp: ${customerPhone}`);
        }

        // Send WhatsApp message
        await client.sendMessage(chatId._serialized, message);
        console.log(`✅ Message sent to ${customerPhone}`);

        res.status(200).send('New order message sent');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error sending message');
    }
});


// 2️⃣ Update Shipment Webhook
app.post('/webhook/update-shipment', async (req, res) => {
    try {
        const order = req.body.payload.order;
        const customerName = order.customer.name;
        const customerPhone = order.shippingAddress.phone.replace(/\D/g,''); // Remove symbols
        const message = `Hi ${customerName}, your shipment status has been updated!`;

        await client.sendMessage(`${customerPhone}`, message);
        console.log(`Shipment update sent to ${customerPhone}`);

        res.status(200).send('Shipment update message sent');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error sending shipment message');
    }
});

// 3️⃣ Cancel Order Webhook
app.post('/webhook/cancel-order', async (req, res) => {
    try {
        const fixedNumber = '201550068161'; // رقم ثابت للغاء الطلبات
        const message = `Order has been cancelled.`;

        await client.sendMessage(fixedNumber, message);
        console.log(`Cancel message sent to ${fixedNumber}`);

        res.status(200).send('Cancel message sent');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error sending cancel message');
    }
});

// Start Express server
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
