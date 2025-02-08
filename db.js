const mongoose = require('mongoose');
require('dotenv').config();
const MONGODB_URI = process.env.MONGODB_URI;
const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI || 'mongodb://localhost:27017/file_manager', {
            useNewUrlParser: true,
            // useUnifiedTopology: true,
            // useCreateIndex: true,
            // useFindAndModify: false
        });
        console.log('MongoDB connected...');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

module.exports = connectDB;