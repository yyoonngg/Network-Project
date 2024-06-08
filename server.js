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
app.use(express.json());
app.use(cookieParser()); // 쿠키 파서 추가

// 세션 설정
const sessionMiddleware = session({
    secret: 'supersecretkey12345!@#$%', // 비밀 키
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS를 사용할 경우 true
        httpOnly: true, // 클라이언트에서 쿠키 접근 불가
        maxAge: 60000 // 세션 만료 시간 (1분)
    }
});

app.use(sessionMiddleware);

// Multer 설정
const upload = multer({ 
    dest: 'uploads/', 
    limits: { fileSize: 10 * 1024 * 1024 }, // 파일 크기 제한 (10MB)
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
        if (!allowedTypes.includes(file.mimetype)) {
            const error = new Error("Invalid file type");
            error.code = "INVALID_FILE_TYPE";
            return cb(error, false);
        }
        cb(null, true);
    }
});

// FTP 클라이언트 설정
async function uploadToFTP(filePath, fileName) {
    const client = new ftp.Client();
    client.ftp.verbose = true;
    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASS,
            secure: process.env.FTP_SECURE === 'true'
        });
        await client.uploadFrom(filePath, fileName);
    } catch (err) {
        console.error('FTP upload error:', err);
        throw err;
    } finally {
        client.close();
    }
}

async function listFTPFiles() {
    const client = new ftp.Client();
    client.ftp.verbose = true;
    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASS,
            secure: process.env.FTP_SECURE === 'true'
        });
        return await client.list();
    } catch (err) {
        console.error('FTP list error:', err);
        return [];
    } finally {
        client.close();
    }
}

// 루트 경로에서 login.html 제공
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 세션 ID를 제공하는 엔드포인트
app.get('/get-session-id', (req, res) => {
    res.json({ sessionId: req.sessionID });
});

// 파일 업로드 엔드포인트
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const filePath = path.join(__dirname, req.file.path);
        const fileName = req.file.originalname;
        await uploadToFTP(filePath, fileName);
        fs.unlinkSync(filePath); // 로컬에 저장된 파일 삭제
        res.send({ fileName: fileName });
    } catch (err) {
        res.status(500).send({ error: 'File upload failed' });
    }
});

// 파일 목록 엔드포인트
app.get('/files', async (req, res) => {
    try {
        const files = await listFTPFiles();
        res.send(files.map(file => ({
            name: file.name,
            url: `ftp://${process.env.FTP_HOST}/${file.name}`
        })));
    } catch (err) {
        res.status(500).send({ error: 'Failed to retrieve files' });
    }
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
