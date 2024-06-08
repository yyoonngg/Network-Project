const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ftp = require('basic-ftp');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));
app.use(cookieParser()); // 쿠키 파서 추가

// 세션 설정
const sessionMiddleware = session({
    secret: 'supersecretkey12345!@#$%', // 비밀 키
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false, // HTTPS를 사용하지 않을 경우 false
        httpOnly: true, // 클라이언트에서 쿠키 접근 불가
        maxAge: 60000 // 세션 만료 시간 (1분)
    }
});

app.use(sessionMiddleware);

// Multer 설정
const upload = multer({ dest: 'uploads/' });

// FTP 클라이언트 설정
async function uploadToFTP(filePath, fileName) {
    const client = new ftp.Client();
    client.ftp.verbose = true;
    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASS,
            secure: false  // 필요에 따라 true로 설정
        });
        await client.uploadFrom(filePath, fileName);
    } catch (err) {
        console.error(err);
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
        return await client.list();
    } catch (err) {
        console.error(err);
        return [];
    }
    client.close();
}

// 파일 업로드 엔드포인트
app.post('/upload', upload.single('file'), async (req, res) => {
    const filePath = path.join(__dirname, req.file.path);
    const fileName = req.file.originalname;
    await uploadToFTP(filePath, fileName);
    fs.unlinkSync(filePath); // 로컬에 저장된 파일 삭제
    res.send({ fileName: fileName });
});

// 파일 목록 엔드포인트
app.get('/files', async (req, res) => {
    const files = await listFTPFiles();
    res.send(files.map(file => ({
        name: file.name,
        url: `ftp://${process.env.FTP_HOST}/${file.name}`
    })));
});

// 간단한 라우트 추가 (쿠키 확인용)
app.get('/check-session', (req, res) => {
    res.send(`Session ID: ${req.sessionID}`);
});

// Socket.IO와 Express 세션 공유
io.use((socket, next) => {
    sessionMiddleware(socket.request, socket.request.res || {}, next);
});

io.on('connection', (socket) => {
    console.log('New client connected');
    
    // 클라이언트에 세션 ID를 전달
    socket.emit('sessionId', { sessionId: socket.request.sessionID });

    socket.on('message', (data) => {
        io.emit('message', data);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

server.listen(4000, () => console.log('Listening on port 4000'));
