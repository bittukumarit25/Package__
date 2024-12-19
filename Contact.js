const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
   
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    mobileNumbers: [{
        type: String,
        required: true,
        trim: true
    }],
    profilePhoto: {
        type: String
    }
}, {
    timestamps: true
});

// Create indexes
contactSchema.index({ userId: 1 });
contactSchema.index({ fullName: 'text', email: 'text' });

const Contact = mongoose.model('Contact', contactSchema);
module.exports = Contact;
