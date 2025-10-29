// index.js - Enhanced with Multiple Store Owners

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');

const app = express();
app.use(express.json());




app.get('/', (req, res) => {
    res.json({ 
        message: 'Glam&Glow WhatsApp Bot', 
        status: 'Running',
        timestamp: new Date().toISOString()
    });
});

app.get('/test', (req, res) => {
    res.json({
        message: 'Test endpoint working! 🎉',
        serverTime: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Log all requests
app.use((req, res, next) => {
    console.log('📨 Request:', req.method, req.url);
    next();
});











// 📁 Storage files
const STORAGE_FILE = './customer_phones.json';
const WEBHOOK_LOG_FILE = './webhook_logs.json';

// 👑 MULTIPLE STORE OWNERS
const STORE_OWNERS = [
    '201001933044', // 👈 Owner 1 - Replace with actual number
    '201148084901'  // 👈 Owner 2 - Replace with actual number
];

// Initialize storage
let customerPhones = {};
let webhookLogs = {};

// Load existing data
function loadStorageData() {
    try {
        if (fs.existsSync(STORAGE_FILE)) {
            const data = fs.readFileSync(STORAGE_FILE, 'utf8');
            customerPhones = JSON.parse(data);
            console.log(`📋 Loaded ${Object.keys(customerPhones).length} customer phones`);
        }
        
        if (fs.existsSync(WEBHOOK_LOG_FILE)) {
            const data = fs.readFileSync(WEBHOOK_LOG_FILE, 'utf8');
            webhookLogs = JSON.parse(data);
            console.log(`📊 Loaded ${Object.keys(webhookLogs).length} webhook logs`);
        }
    } catch (error) {
        console.log('📋 Starting with fresh storage');
        customerPhones = {};
        webhookLogs = {};
    }
}

function saveStorageData() {
    try {
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(customerPhones, null, 2));
        fs.writeFileSync(WEBHOOK_LOG_FILE, JSON.stringify(webhookLogs, null, 2));
    } catch (error) {
        console.error('❌ Error saving storage data:', error);
    }
}

loadStorageData();

// WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "glamglow-bot",
        dataPath: "./sessions"
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('📱 Scan this QR code:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ WhatsApp client is ready!');
});

client.initialize();

// 🎯 MAIN WEBHOOK ENDPOINT
app.post('/webhooks/wuilt', async (req, res) => {
    const startTime = Date.now();
    
    try {
        console.log('📦 Received Webhook');
        
        const { event, payload, metadata } = req.body;
        
         if (!event || !payload) {
            return res.status(200).json({ 
                status: 'OK',
                message: 'Invalid webhook format - but responding with 200',
                timestamp: new Date().toISOString()
            }); 
        } 

        // Duplicate detection
        const webhookSignature = `${event}-${metadata?.timestamp}-${payload.order?.orderId || payload.order?._id}`;
        
        //if (webhookLogs[webhookSignature]) {
         //   console.log('🔄 Duplicate webhook skipped:', webhookSignature);
          //  return res.status(200).send('OK - Already processed');
        //}

        webhookLogs[webhookSignature] = {
            processedAt: new Date().toISOString(),
            event: event
        };
        saveStorageData();

        // Respond immediately
        res.status(200).send('OK');

        if (!client.info) {
            console.log('⚠️ WhatsApp client not ready');
            return;
        }

        console.log(`🔔 Processing ${event}`);

        // Process webhook
        setImmediate(async () => {
            try {
                let result;
                switch (event) {
                    case 'ORDER_PLACED':
                        result = await handleOrderPlaced(payload.order);
                        break;
                    case 'SHIPMENT_UPDATED':
                        result = await handleShipmentUpdate(payload);
                        break;
                    case 'ORDER_CANCELED':
                        result = await handleOrderCancel(payload.order);
                        break;
                    default:
                        console.log(`⚡ Unhandled event: ${event}`);
                }
                
                console.log(`✅ ${event} processed - Result: ${result}`);
                
            } catch (error) {
                console.error(`❌ Error processing ${event}:`, error);
            }
        });

    } catch (error) {
        console.error('💥 Webhook error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// 🛍️ HANDLE NEW ORDER - WITH MULTIPLE OWNERS
async function handleOrderPlaced(order) {
    try {
        if (!order?.customer || !order?.shippingAddress) {
            return 'invalid_data';
        }

        const orderId = order._id;
        const customerName = order.customer.name;
        const rawPhone = order.shippingAddress.phone;
        const customerPhone = formatPhone(rawPhone);
        
        if (!customerPhone) {
            return 'invalid_phone';
        }

        // Store customer phone
        storeCustomerPhone(orderId, customerPhone, customerName);
        
        const orderNumber = order.orderSerial;
        const totalAmount = order.totalPrice.amount;

        // 🕯️ CUSTOMER MESSAGE - Order Confirmation
        const customerMessage = `Hey ${customerName} 💛  

Your Glam&Glow order (#${orderNumber}) has been successfully placed! 🕯  
We're getting it ready and it'll start processing shortly.  

🧾 Total: ${totalAmount} EGP  

You'll get another message once the shipping company picks it up for delivery 🚚  
Thanks for choosing Glam&Glow — we can't wait for you to enjoy your order! ✨`;

        // 🛍️ STORE OWNERS MESSAGE - New Order Notification
        const itemsList = order.items.map(item => 
            `- ${item.title} × ${item.quantity}`
        ).join('\n');

        const ownerMessage = `🛍 New Order Received!

👤 Customer: ${order.customer.name}  
📞 Phone: ${order.customer.phone}  

🧾 Order Number: #${orderNumber}  
💰 Total: ${totalAmount} ${order.totalPrice.currencyCode}  
🚚 Shipping: ${order.shippingRateName}  

📦 Items (${order.itemsCount || order.items.length}):
${itemsList}

Please check your dashboard to review and start processing the order.`;

        // Send messages
        const customerSent = await sendWhatsApp(customerPhone, customerMessage, customerName);
        
        // ✅ Send to MULTIPLE store owners
        const ownerResults = [];
        for (const ownerPhone of STORE_OWNERS) {
            const ownerSent = await sendWhatsApp(ownerPhone, ownerMessage, `Owner ${STORE_OWNERS.indexOf(ownerPhone) + 1}`);
            ownerResults.push(ownerSent);
        }

        const ownersSuccess = ownerResults.filter(result => result).length;
        return `customer:${customerSent}, owners:${ownersSuccess}/${STORE_OWNERS.length}`;
        
    } catch (error) {
        console.error('❌ Order processing error:', error);
        return 'error';
    }
}

// 🚚 HANDLE SHIPMENT UPDATE
async function handleShipmentUpdate(payload) {
    try {
        const { events, order } = payload;
        
        if (!order || !events) {
            return 'invalid_data';
        }

        const orderId = order.orderId;
        const customerPhone = getCustomerPhone(orderId);
        
        if (!customerPhone) {
            console.log(`❌ No phone found for order: ${orderId}`);
            return 'phone_not_found';
        }

        const customerName = customerPhones[orderId]?.name || 'there';
        const orderNumber = order.orderSerial;
        const shippingCompany = order.companyName || order.shippingRateName || 'shipping company';

        console.log('📦 Processing shipment events:', events);

        // Handle different shipment events
        for (const event of events) {
            switch (event) {
                case 'OrderShipmentPickedUp':
                    await handlePickupEvent(customerPhone, customerName, orderNumber, shippingCompany);
                    break;
                    
                case 'OrderShipmentDelivered':
                    await handleDeliveryEvent(customerPhone, customerName, orderNumber);
                    break;
                    
                case 'OrderShipmentIsOnTheWay':
                    await handleInTransitEvent(customerPhone, customerName, orderNumber, shippingCompany);
                    break;
                    
                default:
                    console.log(`📦 Other shipment event: ${event}`);
            }
        }

        return 'events_processed';
        
    } catch (error) {
        console.error('❌ Shipment processing error:', error);
        return 'error';
    }
}

// 🚚 PICKUP EVENT HANDLER
async function handlePickupEvent(customerPhone, customerName, orderNumber, shippingCompany) {
    const pickupMessage = `Hey ${customerName}! 💛  

Good news — your order #${orderNumber} has been picked up by ${shippingCompany} 🚚  

It's now on its way to you! 🕊  

Thank you for shopping with Glam&Glow ✨  
Enjoy your new items! 🕯`;

    return await sendWhatsApp(customerPhone, pickupMessage, customerName);
}

// 🎉 DELIVERY EVENT HANDLER
async function handleDeliveryEvent(customerPhone, customerName, orderNumber) {
    const deliveryMessage = `Hey ${customerName}! 💛  

We hope you're loving your new candles from Glam&Glow 🕯✨  
Your support truly means the world to us! 💫  

We'd love to invite you to join our Glam&Glow Family WhatsApp group 💬  
You'll get a permanent 10% OFF on all your future orders, plus early access to new launches and special offers! 🎁  

👉 Join here: https://chat.whatsapp.com/Gp4PBj6O2J8HTWgaHQ0S8i

Can't wait to see you there! 💛`;

    return await sendWhatsApp(customerPhone, deliveryMessage, customerName);
}

// 🚛 IN TRANSIT EVENT HANDLER
//async function handleInTransitEvent(customerPhone, customerName, orderNumber, shippingCompany) {
//    const transitMessage = `Hey ${customerName}! 💛  
//
//Quick update — your order #${orderNumber} is currently on the move with ${shippingCompany} 🚛  
//
//It's making its way to you and we'll notify you as soon as it's out for delivery! 📦  
//
//Almost there! ✨`;
//
//    return await sendWhatsApp(customerPhone, transitMessage, customerName);
//}

// ❌ HANDLE ORDER CANCELLATION - NOTIFY OWNERS TOO
async function handleOrderCancel(order) {
    try {
        const orderId = order._id;
        const customerName = order.customer?.name || 'there';
        const rawPhone = order.shippingAddress?.phone;
        const customerPhone = formatPhone(rawPhone);
        
        if (!customerPhone) {
            return 'invalid_phone';
        }

        const orderNumber = order.orderSerial;
        
        // Customer cancellation message
        const cancelMessage = `Hey ${customerName} 💛

We wanted to let you know that your order #${orderNumber} has been canceled.

If this was a mistake or you have any questions, please reply to this message and we'll help you out!

Thank you for considering Glam&Glow ✨`;

        // Owner cancellation notification
        const ownerCancelMessage = `❌ Order Cancelled

Order #${orderNumber} has been canceled.

Customer: ${customerName}
Phone: ${rawPhone}

Reason: ${order.cancelReason || 'Not specified'}`;

        // Send to customer
        const customerSent = await sendWhatsApp(customerPhone, cancelMessage, customerName);
        
        // Send to all owners
        const ownerResults = [];
        for (const ownerPhone of STORE_OWNERS) {
            const ownerSent = await sendWhatsApp(ownerPhone, ownerCancelMessage, `Owner ${STORE_OWNERS.indexOf(ownerPhone) + 1}`);
            ownerResults.push(ownerSent);
        }

        // Remove from storage if canceled
        if (customerSent) {
            delete customerPhones[orderId];
            saveStorageData();
        }
        
        const ownersSuccess = ownerResults.filter(result => result).length;
        return `customer:${customerSent}, owners:${ownersSuccess}/${STORE_OWNERS.length}`;
        
    } catch (error) {
        console.error('❌ Cancel order error:', error);
        return 'error';
    }
}

// 💾 PHONE STORAGE FUNCTIONS
function storeCustomerPhone(orderId, phone, name) {
    customerPhones[orderId] = {
        phone: phone,
        name: name,
        storedAt: new Date().toISOString()
    };
    saveStorageData();
    console.log(`💾 Stored phone for ${name}`);
}

function getCustomerPhone(orderId) {
    return customerPhones[orderId]?.phone;
}

// 🔧 UTILITY FUNCTIONS
function formatPhone(rawPhone) {
    if (!rawPhone) return null;
    
    let cleaned = rawPhone.replace(/\D/g, '');
    
    if (cleaned.startsWith('0')) {
        cleaned = '2' + cleaned.substring(1);
    } else if (cleaned.startsWith('1') && cleaned.length === 10) {
        cleaned = '2' + cleaned;
    } else if (!cleaned.startsWith('2') && cleaned.length === 10) {
        cleaned = '2' + cleaned;
    }
    
    return cleaned.length >= 11 ? cleaned : null;
}

async function sendWhatsApp(phone, message, recipientName) {
    try {
        console.log(`📤 Sending to ${recipientName} (${phone})`);
        
        const chatId = await client.getNumberId(phone);
        if (!chatId) {
            console.log(`⚠️ Not on WhatsApp: ${phone}`);
            return false;
        }

        await client.sendMessage(chatId._serialized, message);
        console.log(`✅ Sent to ${recipientName}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Send failed to ${recipientName}:`, error.message);
        return false;
    }
}

// 🏥 HEALTH CHECK
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK',
        timestamp: new Date().toISOString(),
        whatsapp: client.info ? 'Connected' : 'Connecting',
        storage: {
            customerPhones: Object.keys(customerPhones).length,
            webhookLogs: Object.keys(webhookLogs).length
        },
        storeOwners: {
            count: STORE_OWNERS.length,
            numbers: STORE_OWNERS
        }
    });
});

// 👑 MANAGE STORE OWNERS ENDPOINTS
app.get('/owners', (req, res) => {
    res.json({
        owners: STORE_OWNERS.map((phone, index) => ({
            id: index + 1,
            phone: phone,
            status: 'active'
        }))
    });
});

// Add new owner (for future use)
app.post('/owners', (req, res) => {
    const { phone } = req.body;
    
    if (!phone) {
        return res.status(400).json({ error: 'Phone number required' });
    }

    const formattedPhone = formatPhone(phone);
    if (!formattedPhone) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }

    if (STORE_OWNERS.includes(formattedPhone)) {
        return res.status(400).json({ error: 'Owner already exists' });
    }

    STORE_OWNERS.push(formattedPhone);
    
    res.json({
        message: 'Owner added successfully',
        totalOwners: STORE_OWNERS.length,
        newOwner: formattedPhone
    });
});


app.use((req, res) => {
    res.status(200).json({ status: 'OK' });
});



// 🚀 START SERVER
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`
🕯 GLAM&GLOW WHATSAPP BOT STARTED
📍 Port: ${PORT}
📞 Webhook: POST http://localhost:${PORT}/webhooks/wuilt
❤️ Health: GET http://localhost:${PORT}/health
👑 Owners: GET http://localhost:${PORT}/owners
💾 Storage: ${Object.keys(customerPhones).length} customers
👥 Store Owners: ${STORE_OWNERS.length} owners
    `);
    
    // Display owner numbers (masked for security)
    STORE_OWNERS.forEach((phone, index) => {
        const maskedPhone = phone.substring(0, 6) + '****' + phone.substring(10);
        console.log(`   👑 Owner ${index + 1}: ${maskedPhone}`);
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🔄 Shutting down Glam&Glow bot...');
    saveStorageData();
    await client.destroy();
    process.exit(0);
});




