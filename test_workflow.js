const dns = require('dns');
try {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
    console.warn('Could not set custom DNS servers:', e.message);
}
const mongoose = require('mongoose');
require('dotenv').config();

const BookingRequest = require('./models/BookingRequest');
const ChatMessage = require('./models/ChatMessage');
const PaymentTransaction = require('./models/PaymentTransaction');

async function testWorkflow() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/roomhy');
        console.log('Connected.');

        // 1. Create a dummy pending booking request
        const mockBooking = await BookingRequest.create({
            property_id: '69fb10f1a3ee10dbc450e070',
            property_name: 'jhvhhjhjv',
            area: 'Vijay Nagar',
            rent_amount: 2345,
            user_id: 'harshdeep20020203@gmail.com',
            name: 'Harshdeep Kaur',
            phone: '9464165010',
            email: 'harshdeep20020203@gmail.com',
            owner_id: 'ROOMHY9999',
            owner_name: 'Test Bid Owner',
            request_type: 'bid',
            status: 'pending',
            booking_status: 'pending'
        });
        console.log('Created mock booking:', mockBooking._id);

        // 2. Call the approve route handler programmatically or make an HTTP request to the running server.
        // Let's call the endpoints via fetch to test the actual running API!
        const PORT = process.env.PORT || 5001;
        const BASE_URL = `http://localhost:${PORT}/api/booking`;
        const CHAT_URL = `http://localhost:${PORT}/api/chat`;

        console.log('Testing Approve endpoint...');
        const approveRes = await fetch(`${BASE_URL}/requests/${mockBooking._id}/approve`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                approvalDetails: {
                    tenantName: 'Harshdeep Kaur',
                    propertyName: 'jhvhhjhjv',
                    rentAmount: 2345
                }
            })
        }).then(r => r.json());
        
        console.log('Approve response:', approveRes);

        // 3. Verify that the welcome message was created in the chat room
        // Check ChatMessage for the user's room
        const userRoomId = `roomhyweb${String(946285).padStart(6, '0')}`; // Hash of harshdeep20020203@gmail.com
        const messages = await ChatMessage.find({ room_id: userRoomId }).sort({ created_at: -1 });
        console.log(`Found ${messages.length} messages in tenant's room:`);
        messages.forEach(m => console.log(`- From ${m.sender_role}/${m.sender_login_id}: "${m.message}"`));

        // 4. Send a payment link message via chat/send API to verify it does NOT get masked
        console.log('Sending payment link message...');
        const paymentMsgText = `Dear Harshdeep Kaur, please complete the payment of ₹2345 to secure your booking for "jhvhhjhjv". 💳 You can pay securely via Razorpay here: http://localhost:5173/website/pay?bookingId=${mockBooking._id}&amount=2345`;
        
        const sendMsgRes = await fetch(`${CHAT_URL}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from_login_id: 'ROOMHY9999',
                to_login_id: 'harshdeep20020203@gmail.com',
                message: paymentMsgText
            })
        }).then(r => r.json());
        console.log('Send message response:', sendMsgRes);

        // Retrieve the sent message to verify it wasn't masked
        const sentMsg = await ChatMessage.findById(sendMsgRes.message._id);
        console.log('Retrieved chat message:', {
            message: sentMsg.message,
            is_masked: sentMsg.is_masked,
            violation_type: sentMsg.violation_type
        });

        // Check if payment_link_sent_at was updated
        const updatedBookingAfterMsg = await BookingRequest.findById(mockBooking._id);
        console.log('Booking request payment_link_sent_at:', updatedBookingAfterMsg.payment_link_sent_at);

        // 5. Test Payment Confirmation route
        console.log('Testing Payment Confirmation route...');
        const confirmRes = await fetch(`${BASE_URL}/payment/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                bookingId: mockBooking._id.toString(),
                paymentId: 'pay_test_' + Date.now(),
                orderId: 'order_test_' + Date.now(),
                signature: 'sig_test_' + Date.now(),
                amount: 2345
            })
        }).then(r => r.json());
        console.log('Confirm payment response:', confirmRes);

        // Verify database state of booking
        const finalizedBooking = await BookingRequest.findById(mockBooking._id);
        console.log('Finalized booking status:', {
            status: finalizedBooking.status,
            booking_status: finalizedBooking.booking_status,
            payment_status: finalizedBooking.payment_status,
            payment_id: finalizedBooking.payment_id,
            payment_amount: finalizedBooking.payment_amount
        });

        // Verify that PaymentTransaction was created
        const tx = await PaymentTransaction.findOne({ booking_id: mockBooking._id.toString() });
        if (tx) {
            console.log('PaymentTransaction created successfully:', {
                booking_id: tx.booking_id,
                booking_amount: tx.booking_amount,
                commission_percentage: tx.commission_percentage,
                commission_amount: tx.commission_amount,
                owner_amount: tx.owner_amount,
                payout_status: tx.payout_status,
                owner_id: tx.owner_id
            });
        } else {
            console.log('❌ PaymentTransaction NOT found!');
        }

        // Clean up
        await BookingRequest.findByIdAndDelete(mockBooking._id);
        if (tx) {
            await PaymentTransaction.findByIdAndDelete(tx._id);
        }
        await ChatMessage.deleteMany({ room_id: userRoomId });
        console.log('Cleaned up mock data.');

    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        await mongoose.disconnect();
    }
}

testWorkflow();
