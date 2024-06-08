const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ftp = require('basic-ftp');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

const sessionMiddleware = session({
    secret: 'supersecretkey12345!@#$%',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 60000
    }
});

app.use(sessionMiddleware);

const upload = multer({ dest: 'uploads/' });

async function uploadToFTP(filePath, fileName) {
    const client = new ftp.Client();
    client.ftp.verbose = true;
    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASS,
            secure: false
        });
        await client.uploadFrom(filePath, `/upload/${fileName}`);
    } catch (err) {
        console.error('FTP 연결 오류:', err);
    }
    client.close();
}

async function listFTPFiles() {
    const client = new ftp.Client();
    client.ftp.verbose = true;
    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASS,
            secure: false
        });
        return await client.list('/upload');
    } catch (err) {
        console.error('FTP 연결 오류:', err);
        return [];
    }
    client.close();
}

app.post('/upload', upload.single('file'), async (req, res) => {
    const filePath = path.join(__dirname, req.file.path);
    const fileName = req.file.originalname;
    await uploadToFTP(filePath, fileName);
    fs.unlinkSync(filePath);
    res.send({ fileName: fileName });
});

app.get('/files', async (req, res) => {
    const files = await listFTPFiles();
    res.send(files.map(file => ({
        name: file.name,
        url: `/download/${file.name}`
    })));
});

app.get('/check-session', (req, res) => {
    res.send(`Session ID: ${req.sessionID}`);
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/login', (req, res) => {
    req.session.username = req.body.username;
    res.redirect('/chat');
});

app.get('/chat', (req, res) => {
    if (!req.session.username) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/download/:filename', (req, res) => {
    const fileName = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', fileName);
    res.download(filePath);
});

io.use((socket, next) => {
    sessionMiddleware(socket.request, socket.request.res || {}, next);
});

io.on('connection', (socket) => {
    console.log('New client connected');
    
    if (socket.request.session.username) {
        const username = socket.request.session.username;
        socket.emit('message', `${username}님이 입장하셨습니다.`);
    }

    socket.on('message', (data) => {
        const username = socket.request.session.username;
        io.emit('message', `${username}: ${data}`);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

app.get('/', (req, res) => {
    res.redirect('/login');
});

server.listen(4000, () => console.log('Listening on port 4000'));
