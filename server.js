const http = require('http')
const { Server } = require('socket.io')
const express = require('express')

const port = 5500
const app = express()
const httpServer = http.createServer(app)
// 创建信令服务器
const io = new Server(httpServer, {
  cors: {
    origin: '*', // 允许跨域
    methods: ['GET', 'POST'], // 允许的请求方式
    allowedHeaders: '*', // 允许的请求头
    credentials: true, // 允许携带cookie
  },
  allowEIO3: true, // 是否启用与Socket.IO v2客户端的兼容性
  transport: ['websocket'], // 仅允许websocket,["polling", "websocket"]
})

// 在指定端口启动服务器
httpServer.listen(port, () => {
  console.log('\n Http server up and running at => http://%s:%s', httpServer.address().address, httpServer.address().port)
})

// 房间信息
const roomList = [];
// 每个房间最多容纳的人数
const MAX_USER_COUNT = 2

// 监听用户连接
io.on('connection', (socket) => {
  console.log('connection~');
  // 用户加入房间
  socket.on('join', data => {
    handleUserJoin(socket, data);
  })

  // 用户离开房间
  socket.on('leave', data => {
    hanldeUserDisconnect(socket, data);
  })

  // 用户断线
  socket.on('disconnect', data => {
    hanldeUserDisconnect(socket, data);
  })

  // 用户交换 ice candidate
  socket.on('icecandidate', data => {
    socket.to(data.roomId).emit('icecandidate', data)
  })

  // 用户发送offer
  socket.on('offer', data => {
    socket.to(data.roomId).emit('offer', data);
  })

  // 用户发送answer
  socket.on('answer', data => {
    socket.to(data.roomId).emit('answer', data);
  })

  // 用户发送消息
  socket.on('message', async (data) => {
    const { roomId, msg } = data;
    await syncEmitToRoom(roomId, 'message', msg)
    // 通知该用户消息发送成功
    socket.emit('messageArrive', msg)
  })

  // 同步化socket.emit()
  function syncEmitToRoom(roomId, eventName, data) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        socket.to(roomId).emit(eventName, data, (response) => {
          // todo 模拟网络延迟
          resolve(response)
        })
      }, 2000);
    })
  }
})



function handleUserJoin(socket, data) {
  const { userId, roomId } = data
  const filterRoom = roomList.filter(room => room.roomId === roomId)[0];
  let room = null;

  if (filterRoom) {
    room = filterRoom;
    // 判断用户已经在房间内
    if (room.userIds.includes(userId)) {
      socket.emit('error', '你已在房间内');
      return;
    }
  } else {
    room = {
      userIds: [],
      roomId: roomId,
    }
    roomList.push(room);
  }

  // 每个房间不超过预设的人数
  if (room.userIds.length >= MAX_USER_COUNT) {
    console.log(room.userIds);
    socket.emit('error', '房间人数已满，请稍后再试');
    return;
  }

  // 把用户信息存到房间里
  room.userIds.push(userId);
  console.log(userId + '加入房间' + roomId, room.userIds);

  socket.userId = data.userId
  socket.roomId = data.roomId

  // 将用户加入房间
  socket.join(roomId);
  // 通知房间内的其他用户
  socket.to(roomId).emit('welcome', data);
  // 通知自己加入房间成功
  socket.emit('joined', data);

}

function hanldeUserDisconnect(socket, data) {
  console.log('handle user disconnect~');
  const { userId, roomId } = socket;
  const room = roomList.filter(r => r.roomId === roomId)[0];
  // 把该用户的信息从房间中删除
  const idx = room?.userIds?.indexOf(userId);
  if (idx !== undefined) {
    room.userIds.splice(idx, 1);

    // 用户离开房间
    socket.leave(roomId);
    // 通知房间内的其他用户
    socket.to(roomId).emit('leave', userId);
    // 通知自己退出房间成功
    socket.emit('leaved');
  }
}