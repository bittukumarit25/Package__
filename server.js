const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const User = require('./models/User');
const Contact = require('./models/Contact');
const auth = require('./middleware/auth');
const { sendVerificationEmail } = require('./utils/email');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// MongoDB connection
mongoose.connect("mongodb+srv://rahul90602092:O3HtmJQ8YURg18f4@cluster0.hivwz.mongodb.net/contactapp?retryWrites=true&w=majority&appName=Cluster0", {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB Atlas');
}).catch((error) => {
    console.error('MongoDB connection error:', error);
});

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Only .png, .jpg and .jpeg format allowed!'));
    }
});

// Auth Routes
app.post('/register', upload.single('profilePhoto'), async (req, res) => {
    try {
        const { username, fullName, email, mobileNumber, password } = req.body;
        console.log(req.body)
        // Check if user already exists
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Create verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const user = new User({
            username,
            fullName,
            email,
            mobileNumber,
            password,
            profilePhoto: req.file ? `/uploads/${req.file.filename}` : undefined,
            verificationToken,
            verificationTokenExpiry
        });
        console.log(user)
        await user.save();
        // await sendVerificationEmail(email, verificationToken);

        res.status(201).json({ message: 'Registration successful. Please check your email for verification.' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/verify-email', async (req, res) => {
    try {
        const { token } = req.body;
        const user = await User.findOne({
            verificationToken: token,
            verificationTokenExpiry: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired verification token' });
        }

        user.verified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpiry = undefined;
        await user.save();

        res.json({ message: 'Email verified successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({
            $or: [{ username }, { email: username }]
        });

        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { 
            id: user._id,
            username: user.username,
            fullName: user.fullName,
            email: user.email,
            profilePhoto: user.profilePhoto
        }});
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Contact Routes
app.post('/contacts', auth, upload.single('profilePhoto'), async (req, res) => {
    try {
        const { fullName, email, mobileNumbers } = req.body;
        const contact = new Contact({
            fullName,
            email,
            mobileNumbers: Array.isArray(mobileNumbers) ? mobileNumbers : [mobileNumbers],
            profilePhoto: req.file ? `/uploads/${req.file.filename}` : undefined
        });

        await contact.save();
        res.status(201).json(contact);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.get('/contacts',  async (req, res) => {
    try {
        const { page = 1, limit = 10, search, sort } = req.query;
 
        const sortOptions = {};
        if (sort) {
            const [field, order] = sort.split(':');
            sortOptions[field] = order === 'desc' ? -1 : 1;
        }

        const contacts = await Contact.find()
            .sort(sortOptions)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        console.log(contacts)
     
        res.json({
            contacts,
            currentPage: page
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.put('/contacts/:id', auth, upload.single('profilePhoto'), async (req, res) => {
    try {
        const updates = req.body;
        if (req.file) {
            updates.profilePhoto = `/uploads/${req.file.filename}`;
        }
        
        if (updates.mobileNumbers && !Array.isArray(updates.mobileNumbers)) {
            updates.mobileNumbers = [updates.mobileNumbers];
        }

        const contact = await Contact.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            updates,
            { new: true }
        );

        if (!contact) {
            return res.status(404).json({ message: 'Contact not found' });
        }

        res.json(contact);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.delete('/contacts/:id', auth, async (req, res) => {
    try {
        const contact = await Contact.findOneAndDelete({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!contact) {
            return res.status(404).json({ message: 'Contact not found' });
        }

        res.json({ message: 'Contact deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Profile Routes
app.put('/profile', auth, upload.single('profilePhoto'), async (req, res) => {
    try {
        const updates = req.body;
        if (req.file) {
            updates.profilePhoto = `/uploads/${req.file.filename}`;
        }

        const user = await User.findByIdAndUpdate(
            req.user._id,
            updates,
            { new: true }
        ).select('-password');

        res.json(user);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});