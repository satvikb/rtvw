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
        word: "",
        timeEnd: 0,
        timeStart: 0,
        active: false
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
        client.active = false;
        client.wins = 0;


        client.emit('init', getGameSettings(roomName, allUsers));

        client.join(roomName);
        io.to(roomName).emit('userJoined', client.id, client.username, client.wins);
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
        client.wins = 0;

        client.emit("userJoined", client.id, username, client.wins);
        console.log("start room, word: " + state[roomName].word);
        client.emit('init', getGameSettings(roomName));
    }

    function getGameSettings(roomName, allUsers){
        var userData = {}
        if(allUsers){
            for (var clientId in allUsers) {
                console.log('client:', clientId);
                var client_socket = io.sockets.connected[clientId];//Do whatever you want with this
                userData[clientId] = {
                    username:client_socket.username,
                    wins:client_socket.wins
                }
            }
        }

        return {
            existingUserData: userData
        }
    }
    
    function handleStartGame(){
        const roomName = clientRooms[client.id];
        if(!roomName) {
            return;
        }
        // end time
        if(client.host == true && state[roomName].active == false){
            var roundDuration = 60; // in seconds
            var roundDurationMs = roundDuration * 1000;
            var endTime = new Date().getTime() + roundDurationMs;

            // set all clients to active
            for (var clientId in io.sockets.adapter.rooms[roomName].sockets) {
                var client_socket = io.sockets.connected[clientId];
                client_socket.active = true;
            }

            state[roomName].word = getRandomWord()
            state[roomName].endTime = endTime
            state[roomName].active = true;

            var word = state[roomName].word;
            console.log("starting room, word " + word);
            // game officially started
            io.to(roomName).emit('roomReady', word, endTime);
            let promise = new Promise(function(resolve, reject) {
                var currentWord = state[roomName].word;
                setTimeout(() => {
                    var latestWord = state[roomName].word;
                    // make sure the word hasn't changed
                    // if it has, its a new room
                    if(latestWord == currentWord && state[roomName].active == true) {
                        resolve();
                    }else{
                        // invalid timer, game already ended or new round started
                        reject();
                    }
                    
                }, roundDurationMs) 
            });
            promise.then(result => {
                // timer expired, nobody wins
                sendRoundEnd(roomName, null, true);
            }, error => {
                // invalid timer, ignore
            });
        }
    }

    function handleGuessWord(guess){
        // TODO use active property to disable input from player that joined in the middle of a round
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
        var resObject = {id: client.id, letters:letterRes}
        // client.emit("guess_response", resObject);
        io.to(roomName).emit('guess_response', resObject);

        if(correctLetters == roomData.word.length) {
            client.wins += 1;
            // client won the game
            client.emit('guess_win');
            sendRoundEnd(roomName, client.id, false);
        }
    }

    function sendRoundEnd(roomName, winnerId, timerExpired){
        var totalWins = {}
        for (var clientId in io.sockets.adapter.rooms[roomName].sockets) {
            var client_socket = io.sockets.connected[clientId];
            totalWins[clientId] = client_socket.wins;
        }

        var roundEndObject = {
            timerExpired: timerExpired,
            winnerId: winnerId,
            totalWins:totalWins
        }
        // set active to false
        state[roomName].active = false;
        io.to(roomName).emit('roundEnd', roundEndObject);
    }

    function getLetterResponse(actualWord, guess){
        var letterRes = Array.from({length: actualWord.length}, () => 0)
        const LETTER_CORRECT = 2;
        const LETTER_EXISTS = 1;
        const LETTER_DOESNT_EXIST = 0;

        var correctLetters = 0;

        var stillNeeded = {}
        for(var i = 0; i < actualWord.length; i++){
            var l = actualWord[i];
            if(stillNeeded[l] == undefined){
                stillNeeded[l] = 1;
            }else{
                stillNeeded[l] += 1;
            }
        }

        for(var i = 0; i < actualWord.length; i++){
            let guessLetter = guess.charAt(i);
            let solutionLetter = actualWord.charAt(i);
            if(solutionLetter == guessLetter){
                letterRes[i] = LETTER_CORRECT;
                correctLetters += 1;
                stillNeeded[solutionLetter] -= 1;
            }
        }

        for(var i = 0; i < actualWord.length; i++){
            let guessLetter = guess.charAt(i);
            let solutionLetter = actualWord.charAt(i);
            // console.log("final check "+stillNeeded[solutionLetter])
            if(actualWord.indexOf(guessLetter) != -1  && stillNeeded[guessLetter] > 0){
                letterRes[i] = LETTER_EXISTS;
            }else if(actualWord.indexOf(guessLetter) == -1){
                letterRes[i] = LETTER_DOESNT_EXIST;
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