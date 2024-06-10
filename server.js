const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ftp = require('basic-ftp');
const bodyParser = require('body-parser');
const crypto = require('crypto'); // 토큰 생성에 사용
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

const users = {}; // 토큰과 사용자 정보를 저장하기 위한 객체

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
    const username = req.body.username;
    const token = crypto.randomBytes(16).toString('hex'); // 고유 토큰 생성
    users[token] = username; // 사용자 정보를 저장
    res.cookie('auth_token', token, { httpOnly: true });
    res.redirect('/chat');
});

app.get('/chat', (req, res) => {
    const token = req.cookies.auth_token;
    if (!token || !users[token]) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/download/:filename', (req, res) => {
    const fileName = req.params.filename;
    const filePath = path.join(__dirname, 'uploads', fileName);
    res.download(filePath);
});

// 쿠키 파서를 소켓 IO와 함께 사용
const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
io.use(wrap(cookieParser()));

io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);

    const token = socket.request.cookies.auth_token;
    if (token && users[token]) {
        const username = users[token];
        socket.emit('message', `${username}님이 입장하셨습니다.`);
        console.log(`${username}님이 입장하셨습니다. (socket id: ${socket.id})`);

        socket.on('message', (data) => {
            io.emit('message', `${username}: ${data}`);
            console.log(`Message from ${username}: ${data} (socket id: ${socket.id})`);
        });
    } else {
        console.log(`Invalid token for socket id: ${socket.id}`);
        socket.disconnect();
    }

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

app.get('/', (req, res) => {
    const token = req.cookies.auth_token;
    if (token && users[token]) {
        return res.redirect('/chat');
    }
    res.redirect('/login');
});

server.listen(4000, () => console.log('Listening on port 4000'));
