import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // 실제 배포 시에는 클라이언트 도메인으로 제한 필요
        methods: ["GET", "POST"],
    },
});

interface UserPosition {
    x: number;
    y: number;
    z: number;
}

interface User {
    id: string;
    position: UserPosition;
    nickname?: string;
}

const users: Record<string, User> = {};

io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    // 1. 초기 접속 시: 내 ID와 현재 접속자 목록 전달 (닉네임 없이)
    socket.emit("init", { id: socket.id, users });

    // 2. 닉네임 설정 및 게임 참여 (join)
    socket.on("join", (data: { nickname: string }) => {
        const newUser: User = {
            id: socket.id,
            nickname: data.nickname,
            position: {
                x: (Math.random() - 0.5) * 10,
                y: 0,
                z: (Math.random() - 0.5) * 10
            },
        };
        users[socket.id] = newUser;

        // 나에게 내 정보 전송 (위치 확인용)
        socket.emit("joinSuccess", newUser);

        // 다른 사람들에게 알림
        socket.broadcast.emit("playerJoined", newUser);
        console.log(`User joined: ${data.nickname} (${socket.id})`);
    });

    // 3. 유저 이동 (playerMove)
    socket.on("playerMove", (data: { position: UserPosition }) => {
        if (users[socket.id]) {
            users[socket.id].position = data.position;
            // 나를 제외한 모두에게 내 위치 전송
            socket.broadcast.emit("playerMoved", {
                id: socket.id,
                position: data.position,
                // nickname은 이미 알고 있으므로 생략하거나 필요 시 추가
            });
        }
    });

    // 4. 채팅 (chat)
    socket.on("chat", (data: { message: string }) => {
        // 닉네임이 없으면(아직 join 안함) 무시
        if (!users[socket.id]) return;

        // 모두에게 메시지 전송 (나 포함)
        io.emit("chat", {
            id: socket.id,
            sender: users[socket.id].nickname || "Anonymous", // 닉네임 사용
            message: data.message,
            timestamp: Date.now(),
        });
    });

    // 5. 연결 해제
    socket.on("disconnect", () => {
        console.log(`User disconnected: ${socket.id}`);
        delete users[socket.id];
        io.emit("playerLeft", { id: socket.id });
    });
});

const PORT = process.env.PORT || 5050;

server.listen(PORT, () => {
    console.log(`Game Server running on port ${PORT}`);
});
