const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ftp = require('basic-ftp');
require('dotenv').config();

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

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
        console.log(`Uploading ${fileName} to FTP server...`);
        await client.uploadFrom(filePath, `${process.env.FTP_UPLOAD_DIR}/${fileName}`);
        console.log('FTP 업로드 성공:', fileName);
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
        console.log('파일 목록을 가져오는 중...');
        const list = await client.list(process.env.FTP_UPLOAD_DIR);
        console.log('파일 목록:', list);
        return list.filter(item => item.isFile);  // 디렉토리가 아닌 파일만 반환
    } catch (err) {
        console.error('FTP 연결 오류:', err);
        return [];
    }
    client.close();
}

async function downloadFromFTP(fileName, res) {
    const client = new ftp.Client();
    client.ftp.verbose = true;
    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASS,
            secure: false
        });
        const tempFilePath = path.join(__dirname, 'downloads', fileName);
        await client.downloadTo(tempFilePath, `${process.env.FTP_UPLOAD_DIR}/${fileName}`);
        res.download(tempFilePath, fileName, (err) => {
            if (err) {
                console.error('파일 다운로드 오류:', err);
            }
            fs.unlinkSync(tempFilePath); // 임시 파일 삭제
        });
    } catch (err) {
        console.error('FTP 연결 오류:', err);
        res.status(500).send('파일 다운로드 오류');
    }
    client.close();
}

app.post('/upload', upload.single('file'), async (req, res) => {
    console.log('파일 업로드 요청 수신');
    if (!req.file) {
        return res.status(400).send('파일이 업로드되지 않았습니다.');
    }
    const filePath = path.join(__dirname, req.file.path);
    const fileName = req.file.originalname;
    await uploadToFTP(filePath, fileName);
    fs.unlinkSync(filePath);
    res.send({ fileName: fileName });
});

app.get('/files', async (req, res) => {
    const files = await listFTPFiles();
    console.log('파일 목록 전송:', files);
    res.send(files.map(file => ({
        name: file.name,
        url: `/download/${file.name}`
    })));
});

app.get('/download/:fileName', async (req, res) => {
    const fileName = req.params.fileName;
    await downloadFromFTP(fileName, res);
});

app.listen(4000, () => {
    console.log('Server is listening on port 4000');
});
