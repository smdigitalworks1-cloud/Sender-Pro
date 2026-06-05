const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
    // If Resend API Key is defined, use Resend API
    if (process.env.RESEND_API_KEY) {
        const apiKey = process.env.RESEND_API_KEY;
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
        const fromName = process.env.FROM_NAME || 'Sender Pro';

        try {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: `"${fromName}" <${fromEmail}>`,
                    to: [options.email],
                    subject: options.subject,
                    text: options.message,
                    html: options.html
                })
            });

            const data = await response.json();
            if (!response.ok) {
                console.error("❌ Resend API Error:", data);
                throw new Error(data.message || "Failed to send email via Resend");
            }

            console.log(`✅ Email sent successfully via Resend. Message ID: ${data.id}`);
            return data;
        } catch (err) {
            console.error("❌ Resend send failed, falling back to SMTP:", err.message);
        }
    }

    // Create a transporter using SMTP transport
    const port = parseInt(process.env.SMTP_PORT) || 587;
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: port,
        secure: port === 465, // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD,
        },
        tls: {
            // Do not fail on invalid certificates
            rejectUnauthorized: false
        }
    });

    // Define email options
    const fromName = (process.env.FROM_NAME || 'Sender Pro').replace(/^["']|["']$/g, '');
    const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_EMAIL;
    const message = {
        from: `"${fromName}" <${fromEmail}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
        html: options.html, // Optional HTML format
    };

    if (options.replyTo) {
        message.replyTo = options.replyTo;
    }

    // Send the email
    const info = await transporter.sendMail(message);
    console.log('Message sent via SMTP: %s', info.messageId);
};

module.exports = sendEmail;
