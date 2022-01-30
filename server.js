const express = require('express');
const fs = require("fs");
var path = require('path');
const http = require('http');

const { makeid } = require('./utils');

const PORT= process.env.PORT || 3000; 
const INDEX = path.join(__dirname, 'frontend');
const app = express()

const server = http.createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: '*',
        methods: ["GET", "POST"]
    }
});

app.get("/", function(req, res) {
    res.sendFile(path.join(__dirname, '/frontend/index.html'));
});
app.use(express.static(__dirname + '/frontend/'));

const clientRooms = {};
const state = {};

let rawWords = fs.readFileSync('words.json');
const matchDict = JSON.parse(rawWords)["words"];
const numWords = matchDict.length;

function getRandomWord() {
  const idx = Math.floor(numWords * Math.random());
  return matchDict[idx];
}

function initGame()
{
    // initialize the game
    const game = {
        word: getRandomWord(),
    };
    
    return game;
}

io.on('connection', client => {
    
    client.on('guessWord', handleGuessWord);
    client.on('newGame', handleNewGame);
    client.on('joinGame', handleJoinGame);
    client.on('startGame', handleStartGame);

    function handleJoinGame(roomName, username) {
        const room = io.sockets.adapter.rooms[roomName];
        
        let allUsers;
        if (room) {
            allUsers = room.sockets;
        }

        let numClients = 0;
        if (allUsers) {
            numClients = Object.keys(allUsers).length;
        }

        if (numClients === 0) {
            client.emit('unknownCode');
            return;
        } else if (numClients > 6) {
            client.emit('tooManyPlayers');
            return;
        }
        client.emit('gameCode', roomName, false);

        clientRooms[client.id] = roomName;

        client.username = username;
        client.host = false;

        var usernames = {}
        for (var clientId in allUsers) {
            console.log('client:', clientId);
            var client_socket = io.sockets.connected[clientId];//Do whatever you want with this
            usernames[clientId] = client_socket.username;
        }

        client.emit('init', state[roomName].word, usernames);

        client.join(roomName);
        io.to(roomName).emit('userJoined', client.id, client.username);
    }

    function handleNewGame(username) {
        let roomName = makeid(5);
        clientRooms[client.id] = roomName;
        console.log("host true" )
        client.emit('gameCode', roomName, true);
        state[roomName] = initGame();

        client.join(roomName);
        client.username = username;
        client.host = true;
        
        client.emit("userJoined", client.id, username);
        console.log("start room, word: " + state[roomName].word);
        client.emit('init', state[roomName].word);
    }

    function handleStartGame(){
        const roomName = clientRooms[client.id];
        if(!roomName) {
            return;
        }
        // end time
        if(client.host == true){
            var roundDuration = 60; // in seconds
            var endTime = new Date().getTime() + roundDuration * 1000;
            state[roomName].endTime = endTime
            io.to(roomName).emit('roomReady', endTime);
        }
    }

    function handleGuessWord(guess){
        const roomName = clientRooms[client.id];
        if(!roomName) {
            return;
        }
        // check valid word
        if(!matchDict.includes(guess)) {
            client.emit('guess_invalidWord');
            return;
        }

        var roomData = state[roomName];
        // get correct letters
        var letterResponse = getLetterResponse(roomData.word, guess)

        var correctLetters = letterResponse.correctLetters;

        var letterRes = letterResponse.letterRes;
        console.log("response: " + letterRes)
        client.emit("guess_response", letterRes);

        if(correctLetters == roomData.word.length) {
            // client won the game
            var userName = client.usernamne;
            client.emit('guess_win');
            io.to(roomName).emit('gameWon', userName);
        }
    }

    function getLetterResponse(actualWord, guess){
        var letterRes = [];

        const LETTER_CORRECT = 2;
        const LETTER_EXISTS = 1;
        const LETTER_DOESNT_EXIST = 0;

        var correctLetters = 0;
        for(var i = 0; i < actualWord.length; i++){
            let guessLetter = guess.charAt(i);
            let solutionLetter = actualWord.charAt(i);
            if(solutionLetter == guessLetter){
                letterRes.push(LETTER_CORRECT);
                correctLetters += 1;
            }else if(actualWord.indexOf(guessLetter) != -1){
                letterRes.push(LETTER_EXISTS);
            }else{
                letterRes.push(LETTER_DOESNT_EXIST);
            }
        }
        return {
            "correctLetters": correctLetters,
            "letterRes": letterRes
        };
    }
});

// server.listen(PORT);
server.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`)
})