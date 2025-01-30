const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const cors = require('cors');
const nodemailer = require('nodemailer');
const session = require('express-session');
const app = express();

app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));

app.use(express.json());

app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Email transporter configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 's.ramya1128@gmail.com', // Replace with your Gmail
        pass: 'nulc ruvq wfjq phjq' // Replace with your app password
    }
});

mongoose.connect('mongodb://127.0.0.1:27017/Main_Blog').then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB:', err));

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: { type: String }
});

const User = mongoose.model('User', UserSchema);

// Subscriber schema and model
const SubscriberSchema = new mongoose.Schema({
    email: { 
        type: String, 
        required: true, 
        unique: true,
        validate: {
            validator: function(v) {
                return /\S+@\S+\.\S+/.test(v);
            },
            message: props => `${props.value} is not a valid email address!`
        }
    },
    subscribed: { type: Boolean, default: true },
    subscribedAt: { type: Date, default: Date.now }
});

const Subscriber = mongoose.model('Subscriber', SubscriberSchema);

// Blog schema and model
const BlogSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    author: { type: String, required: true },
    category: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date }
});

// Add post-save hook to send emails to subscribers
BlogSchema.post('save', async function(doc) {
    try {
        // Get all active subscribers
        const subscribers = await Subscriber.find({ subscribed: true });
        
        // Prepare email content
        const mailOptions = {
            from: 'your-email@gmail.com', // Replace with your email
            subject: `New Blog Post: ${doc.title}`,
            html: `
                <h2>${doc.title}</h2>
                <p><strong>Category:</strong> ${doc.category}</p>
                <p><strong>Author:</strong> ${doc.author}</p>
                <br>
                <p>${doc.content.substring(0, 200)}...</p>
                <br>
                <p><a href="http://localhost:3000/blog/${doc._id}">Read More</a></p>
                <hr>
                <p><small>You received this email because you're subscribed to our blog updates. 
                <a href="http://localhost:3000/unsubscribe?email=\${recipient}">Unsubscribe</a></small></p>
            `
        };

        // Send email to each subscriber
        for (const subscriber of subscribers) {
            await transporter.sendMail({
                ...mailOptions,
                to: subscriber.email,
                html: mailOptions.html.replace('\${recipient}', subscriber.email)
            });
        }
    } catch (error) {
        console.error('Error sending notification emails:', error);
    }
});

const Blog = mongoose.model('Blog', BlogSchema);

app.post('/register', async(req,res)=>{
    const {username,password}=req.body;

    try{
        const existingUser= await User.findOne({username});
        if(existingUser){
            return res.status(400).json({ message: 'Username already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.status(200).json({ message: 'Registration successful' });
    }
    catch(err){
        console.error(err);
        res.status(500).json({ message: 'Registration failed' });
    }
});

// Login endpoint
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        const passOk = bcrypt.compareSync(password, user.password);
        if (passOk) {
            // Set session
            req.session.username = username;
            res.json({
                id: user._id,
                username,
            });
        } else {
            res.status(400).json({ message: 'Wrong credentials' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error during login' });
    }
});

// Logout endpoint
app.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out successfully' });
});

// Create blog post
app.post('/post', async (req, res) => {
    const { title, content, author, category } = req.body;
    
    // Validate required fields
    if (!title || !content || !author || !category) {
        return res.status(400).json({ message: 'Please fill all required fields' });
    }

    try {
        const newBlog = new Blog({
            title,
            content,
            author,
            category
        });
        
        await newBlog.save();
        res.status(200).json({ 
            message: 'Blog post created successfully', 
            blog: newBlog 
        });
    } catch (error) {
        console.error('Error creating blog:', error);
        res.status(500).json({ message: 'Error creating blog post' });
    }
});

// Get all blog posts
app.get('/post', async (req, res) => {
    try {
        const blogs = await Blog.find().sort({ createdAt: -1 });
        res.json(blogs);
    } catch (error) {
        console.error('Error fetching blogs:', error);
        res.status(500).json({ message: 'Error fetching blogs' });
    }
});

// Edit blog post
app.put('/post/:id', async (req, res) => {
    const { id } = req.params;
    const { title, content, author, category } = req.body;

    if (!title || !content || !author || !category) {
        return res.status(400).json({ message: 'Please fill all required fields' });
    }

    try {
        const updatedBlog = await Blog.findByIdAndUpdate(
            id,
            {
                title,
                content,
                author,
                category,
                updatedAt: Date.now()
            },
            { new: true }
        );

        if (!updatedBlog) {
            return res.status(404).json({ message: 'Blog post not found' });
        }

        res.status(200).json({
            message: 'Blog post updated successfully',
            blog: updatedBlog
        });
    } catch (error) {
        console.error('Error updating blog:', error);
        res.status(500).json({ message: 'Error updating blog post' });
    }
});

// Delete blog post
app.delete('/post/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const deletedBlog = await Blog.findByIdAndDelete(id);

        if (!deletedBlog) {
            return res.status(404).json({ message: 'Blog post not found' });
        }

        res.status(200).json({
            message: 'Blog post deleted successfully',
            blog: deletedBlog
        });
    } catch (error) {
        console.error('Error deleting blog:', error);
        res.status(500).json({ message: 'Error deleting blog post' });
    }
});

// Subscribe endpoint
app.post('/subscribe', async (req, res) => {
    const { email } = req.body;

    try {
        // Check if email is valid
        if (!email || !/\S+@\S+\.\S+/.test(email)) {
            return res.status(400).json({ message: 'Please provide a valid email address' });
        }

        // Check if already subscribed
        const existingSubscriber = await Subscriber.findOne({ email });
        if (existingSubscriber) {
            if (existingSubscriber.subscribed) {
                return res.status(400).json({ message: 'This email is already subscribed' });
            } else {
                // Reactivate subscription
                existingSubscriber.subscribed = true;
                await existingSubscriber.save();
                return res.status(200).json({ message: 'Your subscription has been reactivated' });
            }
        }

        // Create new subscriber
        const newSubscriber = new Subscriber({ email });
        await newSubscriber.save();

        // Send welcome email
        await transporter.sendMail({
            from: 'your-email@gmail.com', // Replace with your email
            to: email,
            subject: 'Welcome to Our Blog!',
            html: `
                <h2>Welcome to Our Blog!</h2>
                <p>Thank you for subscribing to our blog updates. You'll receive notifications whenever we publish new content.</p>
                <p>Best regards,<br>The Blog Team</p>
                <hr>
                <p><small>You can <a href="http://localhost:3000/unsubscribe?email=${email}">unsubscribe</a> at any time.</small></p>
            `
        });

        res.status(200).json({ message: 'Successfully subscribed to blog updates!' });
    } catch (error) {
        console.error('Subscription error:', error);
        res.status(500).json({ message: 'Failed to subscribe. Please try again later.' });
    }
});

// Unsubscribe endpoint
app.post('/unsubscribe', async (req, res) => {
    const { email } = req.body;

    try {
        const subscriber = await Subscriber.findOne({ email });
        if (!subscriber) {
            return res.status(404).json({ message: 'Subscription not found' });
        }

        subscriber.subscribed = false;
        await subscriber.save();

        res.status(200).json({ message: 'Successfully unsubscribed from blog updates' });
    } catch (error) {
        console.error('Unsubscribe error:', error);
        res.status(500).json({ message: 'Failed to unsubscribe. Please try again later.' });
    }
});

// Get user profile by username
app.get('/profile/:username', async (req, res) => {
    const { username } = req.params;
    try {
        const user = await User.findOne({ username }, { password: 0 });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get subscription status and email
        const subscriber = await Subscriber.findOne({ email: { $exists: true } });
        
        res.json({
            user: {
                username: user.username,
                email: subscriber ? subscriber.email : null,
                isSubscribed: subscriber ? subscriber.subscribed : false
            }
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ message: 'Error fetching profile' });
    }
});

// Update user profile
app.put('/profile/:username', async (req, res) => {
    const { username } = req.params;
    const { email } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Update user's email
        user.email = email;
        await user.save();

        // Check subscription status
        const subscriber = await Subscriber.findOne({ email });

        res.json({
            user: {
                username: user.username,
                email: user.email,
                isSubscribed: subscriber ? subscriber.subscribed : false
            }
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ message: 'Error updating profile' });
    }
});

// Get current user profile
app.get('/profile', async (req, res) => {
    try {
        const username = req.session.username;
        if (!username) {
            return res.json(null);
        }

        const user = await User.findOne({ username }, { password: 0 }); // Exclude password
        if (!user) {
            return res.json(null);
        }

        res.json(user);
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ message: 'Error fetching profile' });
    }
});

app.listen(4000, () => {
    console.log('Server is running on port http://localhost:4000');
});