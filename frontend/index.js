const socket = io('https://rtvw.herokuapp.com');
// const socket = io('http://localhost:3000');

const game = document.getElementById('game');
const initialScreen = document.getElementById('initialScreen');
const gameCodeDisplay = document.getElementById('gameCodeDisplay');
const gameState = document.getElementById('gameState');
const newGameBtn = document.getElementById('newGameButton');
const joinGameBtn = document.getElementById('joinGameButton');
const gameCodeInput = document.getElementById('gameCodeInput');
const usernameInput = document.getElementById('usernameInput');

const gameSettingsForm = document.getElementById('gameSettingsForm');
var roundLengthSelect = document.getElementById('roundLengthSelect');
var wordLengthSelect = document.getElementById('wordLengthSelect');
var guessCountSelect = document.getElementById('guessCountSelect');
const startGameButton = document.getElementById('startGameButton');
const playerList = document.getElementById('playerList');
const otherBoardsCanvas = document.getElementById('otherBoardsCanvas');

var isHost = false;

socket.on('init', handleInit);
// socket.on('gameOver', handleGameOver);
socket.on('gameCode', handleGameCode);
socket.on('unknownCode', handleUnknownCode);
socket.on('tooManyPlayers', handleTooManyPlayers);
socket.on('roomReady', handleRoomReady);

socket.on("userJoined", userJoinedRoom);
socket.on("guess_invalidWord", handleInvalidWord);
socket.on("guess_response", handleGuessResponse);
socket.on("guess_win", correctGuess); // only to client who guessed
socket.on("roundEnd", gameEnd); // all clients

socket.on("updateSettings", updateGameSettings)
socket.on('hostAssigned', updateIsHost)
socket.on('playerDisconnected', handlePlayerDisonnected)

socket.on("alreadyInRoom", handleAlreadyInRoom);

// {"Id": {"username":username}}
var currentPlayers = {}

function userJoinedRoom(id, username, wins){
  addUsernameToList(id, username, wins);
}

// should really never be called
function handleAlreadyInRoom(){
  alert("You are already in a room");
}

function updateIsHost(){
  isHost = true;
  gameSettingsForm.style.display = "inline";
  alert("You are now the host.")
}

function handlePlayerDisonnected(id){
  var listEleId = id+"_scoreboard";
  var listEle = document.getElementById(listEleId);
  playerList.removeChild(listEle);
}

function addUsernameToList(id, username, wins){
  if(currentPlayers[id] == undefined){
    currentPlayers[id] = {username: username}
  }else{
    currentPlayers[id].username = username
  }

  var listEleId = id+"_scoreboard";

  var listEle = document.getElementById(listEleId);
  if(listEle == undefined){
    const listEle = document.createElement("li");
    listEle.id = listEleId;

    var usernameEle = document.createElement("span");
    usernameEle.id = id+"_username";

    var winCounter = document.createElement("span");
    winCounter.id = id+"_wins";

    usernameEle.innerText = username;
    winCounter.innerHTML = `&nbsp;Wins: ${wins}`;
    listEle.appendChild(usernameEle);
    listEle.appendChild(winCounter);
    playerList.appendChild(listEle);  
  }else{
    var usernameEle = document.getElementById(id+"_username");
    usernameEle.inner = username;
    var winCounter = document.getElementById(id+"_wins");
    winCounter.innerHTML = `&nbsp;Wins: ${wins}`;
  }

  drawOtherPlayerBoards(currentPlayers)
}

function updateScore(totalScore){
  if(totalScore){
    // update wins for all players
    for (const [id, data] of Object.entries(totalScore)) {
      var wins = data.wins;
      var points = data.points;
      var winCounter = document.getElementById(id+"_wins");
      winCounter.innerHTML = `${wins}`;
    }
  }
}

newGameBtn.addEventListener('click', newGame);
joinGameBtn.addEventListener('click', joinGame);
startGameButton.addEventListener('click', startGame);

// settings
roundLengthSelect.addEventListener("change", settingChanged);
wordLengthSelect.addEventListener("change", settingChanged);
guessCountSelect.addEventListener("change", settingChanged);

function newGame() {
  var username = usernameInput.value;
  if(username == "" || username == undefined){
    username = "player " + Math.floor(Math.random() * 100);
  }
  socket.emit('newGame', username);
  init();
}

function joinGame() {
  const code = gameCodeInput.value;
  var username = usernameInput.value;
  if(username == "" || username == undefined){
    username = "player " + Math.floor(Math.random() * 100);
  }
  socket.emit('joinGame', code, username);
  init();
}

function settingChanged(){
  // get timed, round length, word length, and guess count
  // get values from select settings
  var roundLength = parseInt(roundLengthSelect.value);
  var wordLength = parseInt(wordLengthSelect.value);
  var guessCount = parseInt(guessCountSelect.value);

  // settings object
  var gameSettings = {
    roundLength: roundLength,
    wordLength: wordLength,
    guessCount: guessCount
  };

  // send settings to server
  socket.emit("updateSettings", gameSettings);
}

function startGame(){
  socket.emit("startGame");
}

function updateGameSettings(gameSettings){
  console.log(JSON.stringify(gameSettings));
  createNewGameBoard(gameSettings);
}

function Tile() {
  const element = document.createElement('div');
  element.classList.add('tile-container');
  
  const tile = document.createElement('div');
  tile.classList.add('tile');
  element.appendChild(tile)
  
  let value = ''
  let state = 'tbd'
  
  function get() {
    return value;
  }
  
  function set(letter) {
    tile.innerHTML = letter
    value = letter
  }
  
  function clear (letter) {
    tile.innerHTML = '';
    value = '';
    tile.classList.remove('correct','oop','wrong');
  }
  
  const stateActions = {
    'correct': setCorrect,
    'oop': setOutOfPlace,
    'wrong': setWrong
  }
  
  function setCorrect() 
  {
    tile.classList.add('correct');
  }
  
  function setOutOfPlace() 
  {
    tile.classList.add('oop');
  }
  
  function setWrong() 
  {
    tile.classList.add('wrong');
  }
  
  function setState(newState) {
    state = newState
    if(stateActions[state])
       stateActions[state]();
  }
  
  function getState() {
    return state
  }
  
  return {
    element,
    get,
    set,
    clear,
    setState,
    getState
  }
}

function createGuessRow() {
  // Create container
  const element = document.createElement('div');
  element.classList.add('guess');
  
  let idx = 0

  // Add tiles
  let tiles = [];
  let i = 0;
  for(;i<wordLength;i++) {
    const tile = Tile();
    element.appendChild(tile.element);
    tiles.push(tile);
  }
  
  function appendLetter(letter) {
    if(idx >= wordLength) return
    tiles[idx].set(letter)
    idx++
  }
  
  function deleteLetter() {
    if(idx <= 0) return
    idx--
    tiles[idx].clear()
  }
  
  function getWord() {
    return tiles.reduce((prevValue, curTile) => {
      return prevValue += curTile.get()
    }, '')
  }
  
  function clear() {
    tiles.forEach(tile => tile.clear())
    idx = 0
  }
  
  return {
    element,
    tiles,
    appendLetter,
    deleteLetter,
    getWord,
    clear
  }
}

function createGameBoard() {
  // Create container
  const element = document.createElement('div')
  element.classList.add('board')
  
  // Add rows
  let guesses = [];
  let i = 0;
  for(;i<maxGuesses;i++) {
    const guess = createGuessRow();
    element.appendChild(guess.element);
    guesses.push(guess);
  }
  
  function clear() {
    guesses.forEach(guess => guess.clear())
  }
  
  return {
    element,
    guesses,
    clear
  }
}

// Keyboard
const alphabet = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z']

const keyboardLayout = [['q','w','e','r','t','y','u','i','o','p'],['a','s','d','f','g','h','j','k','l'],['enter','z','x','c','v','b','n','m','delete']]

function createKey(letter, onClick) {
  const element = document.createElement('button');
  element.classList.add('key');
  element.dataset.value = letter
  element.innerHTML = letter.toUpperCase();
  
  element.addEventListener('click', onClick)
  let state = 'tbd'
  
  const stateActions = {
    'correct': setCorrect,
    'oop': setOutOfPlace,
    'wrong': setWrong
  }
  
  function setCorrect() 
  {
    clear()
    element.classList.add('correct');
  }
  
  function setOutOfPlace() 
  {
    clear()
    element.classList.add('oop');
  }
  
  function setWrong() 
  {
    clear()
    element.classList.add('wrong');
  }
  
  function setState(newState) {
    state = newState
    
    if(stateActions[state])
      stateActions[state]()
  }
  
  function getState() {
    return state
  }
  
  function clear() {
    element.classList.remove('correct', 'oop', 'wrong');
  }
  
  return {
    letter,
    element,
    setState,
    getState,
    clear
  }
}

function createKeyboardRow(row, onClick) {
  const element = document.createElement('div')
  element.classList.add('keyboard-row')
  
  const keys = {}
  row.forEach(letter => {
    const key = createKey(letter, onClick);
    keys[letter] = key;
    element.appendChild(key.element);
  })
  
  return { 
    element,
    keys
  }
}

function createKeyboad() {
  const element = document.createElement('div')
  element.classList.add('keyboard')
  
  const keyMap = {}
  keyboardLayout.forEach(keyRow => {
    const row = createKeyboardRow(keyRow, handleClick)
    element.appendChild(row.element)
    Object.assign(keyMap, row.keys)
  })
  
  let callback;
  
  function handleClick(value) {
    if(!callback) return;
    callback(value.srcElement)
  }
  
  function addClickCallback(fn) {
  if(!(fn && typeof fn === 'function')) return
    callback = fn
  }
  
  function removeClickCallback() {
    callback = undefined
  }
  
  function clear() {
    Object.keys(keyMap).forEach(key => keyMap[key].clear())
  }
  
  return {
    element,
    keyMap,
    addClickCallback,
    removeClickCallback,
    clear
  }
}

const keyboard = createKeyboad();

const keyboardElement = document.getElementById('keyboard')
keyboardElement.appendChild(keyboard.element)

// Game Element
const gameEl = document.getElementById('game')

// Messages
function MessageDisplay() {
  const element = document.createElement('div');
  element.classList.add('message', 'hide');
  
  const text = document.createElement('h4');
  text.classList.add('text');
  
  element.appendChild(text);
  
  let isVisible = false;
  const duration = 1000;
  
  function show(value) {
    if(isVisible) return;
    
    if(!(value && typeof value === 'string')) return;
       
    text.innerHTML = value;
    
    element.classList.remove('hide');
    element.classList.add('show');
    isVisible = true;
    
    setTimeout(hide, duration);
  }
  
  function hide() {
    element.classList.remove('show');
    element.classList.add('hide');
    isVisible = false;
  }
  
  return {
    element,
    show
  }
}

var activeGame = false;

// Gameplay
function Game() {
  
  // Create Game Board
  var gameBoard = createGameBoard();

  function GuessIterator() {
    const guesses = gameBoard.guesses
    const maxIdx = guesses.length-1
    let idx = -1
    let guess = guesses[idx]
    return {
      next: function() {
        if (idx >= maxIdx) return { 
          value: undefined,
          done: true
        }

        idx++
        guess = guesses[idx]
        return { 
          value: guess,
          done: false
        }
      }
    }
  }
  
  let guessItr, guess, gameRunning = false;
  
  // let matchWord = ''
  
  // Render
  const container = document.getElementById('game-container');
  container.innerHTML = "";
  container.appendChild(gameBoard.element);
  
  const message = MessageDisplay()
  container.appendChild(message.element)

  function appendGuessEntry(letter) {    
    if(!guess.value) return
      
    if(!(letter && typeof letter === 'string')) return;

    guess.value.appendLetter(letter)
  }

  function deleteGuessEntry() {
    if(!guess.value) return
    guess.value.deleteLetter()
  }

  function submitGuess() {
    const word = guess.value.getWord();

    if(word.length === 0)
    {
      return;
    }
    
    if(word.length !== wordLength && word.length !== 0) {
      handleShortWord();
      return
    }
    
    // if(!(wordDict.includes(word) || matchDict.includes(word)) && word.length !== 0) {
    //   handleInvalidWord();
    //   return ;
    // }
    socket.emit("guessWord", word);

  }

  function handleGuessResponse(responseObj){
    var clientId = responseObj.id;
    var letterResponse = responseObj.letters
    console.log("eval "+JSON.stringify(letterResponse));
    if(clientId == socket.id){
      evaluateTiles(letterResponse);
      guess = guessItr.next();
    }else{
      if(currentPlayers[clientId] == undefined){
        currentPlayers[clientId] = {id: clientId, guesses:[]}
      }
      if(currentPlayers[clientId].guesses == undefined){
        currentPlayers[clientId].guesses = []
      }
      currentPlayers[clientId].guesses.push(letterResponse);
      console.log(currentPlayers[clientId].guesses.length-1, " ", currentPlayers[clientId].guesses);
      drawGuessRow(clientId, currentPlayers[clientId].guesses.length-1);
    }
  }
  
  function evaluateTiles(letterRes) {
    const resMeaning = {
      2: 'correct',
      1: 'oop',
      0: 'wrong'
    }
    // Step through the tiles
    guess.value.tiles.forEach((tile, idx) => {
        tileValue = tile.get();
        // Letter at the same index in the match word
        var matchLetter = letterRes[idx];
        var action = resMeaning[matchLetter]
        tile.setState(action);
        updateKeyboard(tileValue, action);
    })
  }
  
  const keyboardStatePriority = {
    'correct': 0,
    'oop': 1,
    'wrong': 2,
    'tbd': 3
  }
  function updateKeyboard(key, state) {
    const curState = keyboard.keyMap[key].getState();
    
    const curPriority = keyboardStatePriority[curState];
    const newPriority = keyboardStatePriority[state];
    
    if(newPriority >= curPriority) return;
    
    keyboard.keyMap[key].setState(state);
  }
  
  function handleShortWord() {
    message.show(`You need ${wordLength} letters`)
  }
  
  function handleInvalidWord() {
    message.show('Invalid Word')
  }
  
  function startGame() {
    gameBoard.clear();
    drawOtherPlayerBoards(currentPlayers);
    removeListseners();
    keyboard.clear();
    
    guessItr = new GuessIterator();
    guess = guessItr.next();

    activeGame = true;
    gameSettingsForm.style.display = "none";
    otherBoardsCanvas.style.display = "inline";
    // addListeners();
  }
  
  function endGame() {
    activeGame = false;
    removeListseners();
  }
  
  // function giveUp() {
  //   message.show(matchWord.toUpperCase())
  // }
  
  function addListeners() {
    keyboard.addClickCallback(onKeyboardClick)
    window.addEventListener('keydown', onButtonClick)
  }
  
  function removeListseners() {
    keyboard.removeClickCallback()
    window.removeEventListener('keydown', onButtonClick)
  }
  
  let actions = {
    'delete': deleteGuessEntry,
    'backspace': deleteGuessEntry,
    'enter': submitGuess,
    'guess': value => {
      appendGuessEntry(value)
    }
  }

  // Handle io click
  function onButtonClick(evt) {
    parseAction(evt.key)
  }
  
  // Handle Keyboard Letter Click
  function onKeyboardClick(el) {
    parseAction(el.dataset.value);
  }

  function parseAction(key) {
    if(alphabet.includes(key)) {
      actions.guess(key);
      return;
    }

    const action = key.toLowerCase()
    if(!actions[action]) return;
    actions[action]();
  }

  return {
    startGame,
    endGame,
    addListeners,
    handleGuessResponse,
    handleInvalidWord,
    correctGuess
  }
}

var theGame;
var wordLength = 5;
var maxGuesses = 7;

function init() {
  initialScreen.style.display = "none";
  game.style.display = "inline";
  console.log("INIT")
}

function handleInit(gameSettings){
  var existingUsers = gameSettings.existingUserData;

  if(existingUsers){
    for (const [key, data] of Object.entries(existingUsers)) {
      console.log(key, data);
      var username = data.username;
      var wins = data.wins;
      addUsernameToList(key, username, wins);
    }
  }

  createNewGameBoard(gameSettings);
}

function handleGameCode(gameCode, host) {
  gameCodeDisplay.innerText = "Game Code: "+gameCode;
  isHost = host;
  if(isHost){
    console.log("updating form")
    gameSettingsForm.style.display = "inline";
  }
}

function createNewGameBoard(gameSettings){
  if(gameSettings.wordLength){
    wordLength = gameSettings.wordLength;
  }
  if(gameSettings.guessCount){
    maxGuesses = gameSettings.guessCount;
  }

  console.log("Create new board "+JSON.stringify(gameSettings));

  // update the select values to match the game settings
  wordLengthSelect.value = wordLength;
  guessCountSelect.value = maxGuesses;
  roundLengthSelect.value = gameSettings.roundLength;

  if(theGame != undefined){
    delete theGame;
  }
  theGame = new Game();
  gameState.innerText = ``;
}

function handleUnknownCode() {
  reset();
  alert('Unknown Game Code')
}

function handleTooManyPlayers() {
  reset();
  alert('This game is already in progress');
}

var roundEndTime = 0;
function handleRoomReady(gameSettings) {
  createNewGameBoard(gameSettings);

  theGame.startGame();
  theGame.addListeners();

  if(gameSettings.timed){
    var endTime = gameSettings.endTime;
    roundEndTime = endTime;
    beginTimer();
  }
}

function beginTimer(){
  var interval = 100; // ms
  var expected = Date.now() + interval;
  setTimeout(step, interval);
  function step() {
      var dt = Date.now() - expected; // the drift (positive for overshooting)
      if (dt > interval) {
          // something really bad happened. Maybe the browser (tab) was inactive?
          // possibly special handling to avoid futile "catch up" run
      }
      // do what is to be done
      var timeLeft = roundEndTime-Date.now(); // in ms
      var secondsLeft = Math.floor(timeLeft/1000);
      if(activeGame == true){
        gameState.innerText = `${secondsLeft}`;
      }

      expected += interval;
      // only continue if timeLeft is positive
      if(Date.now() < roundEndTime && activeGame == true){
        setTimeout(step, Math.max(0, interval - dt)); // take into account drift
      }
  }
}

function reset() {
  gameCodeInput.value = '';
  initialScreen.style.display = "block";
  game.style.display = "none";
}


function handleInvalidWord(){
  theGame.handleInvalidWord();
}

function handleGuessResponse(letterRes){
  theGame.handleGuessResponse(letterRes);
}

// only the client that wins call this
function correctGuess(){

}

function gameEnd(roundEndObject){
  var endMethod = roundEndObject.method;
  var answer = roundEndObject.word;
  if(endMethod == "timedOut"){
    gameState.innerText = `Timer expired, nobody wins! Word: `+answer;
  }else if(endMethod == "guessLimit"){
    gameState.innerText = `Nobody guessed it right! Word: `+answer;
  }else if(endMethod == "playerWon"){
    // actual winner
    var winnerId = roundEndObject.winner;
    if(winnerId != undefined){
      var winnerObject = currentPlayers[winnerId];
      if(winnerObject){
        var winnerName = winnerObject.username;
      }
    }

    var totalScore = roundEndObject.totalScore;
    updateScore(totalScore);

    gameState.innerText = `${winnerName} wins!`;
  }

  if(isHost){
    gameSettingsForm.style.display = "inline";
  }

  // reset guesses
  // loop through all players and reset their guesses
  for (const [key, value] of Object.entries(currentPlayers)) {
    value.guesses = [];
  }

  theGame.endGame();
}

// other board canvas
var canvasData = {}
var boardCtx;
function drawOtherPlayerBoards(players){
  var c = otherBoardsCanvas;
  var w = window.innerWidth/3;//c.clientWidth;
  var h = window.innerHeight;

  // var w = c.clientWidth;
  // var h = c.clientHeight;
  console.log("resetOtherPlayerBoards: ", w, h);
  c.width = w;
  c.height = h;


  var ctx = c.getContext("2d");
  boardCtx = ctx;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.translate(0.5, 0.5)


  /* all percents */
  var MAX_HEIGHT = 0.3;
  var BOARDS_PER_ROW = 2;
  var NUM_ROWS = Math.ceil(Object.keys(players).length / BOARDS_PER_ROW);
  var HORIZONAL_PADDING = 0.02;
  var VERTICAL_PADDING = 0.02;
  var BOARD_WIDTH = (1 - HORIZONAL_PADDING * 2) / BOARDS_PER_ROW;
  var BOARD_HEIGHT = Math.min((1 - VERTICAL_PADDING * 2) / NUM_ROWS, MAX_HEIGHT);

  // ctx.strokeStyle = "green";
  // ctx.strokeRect(0, 10, w, h-20);

  ctx.font = "20px Arial";
  ctx.fillStyle = "black";
  ctx.textAlign = "center";
  // ctx.fillText("Other Players", c.width/2, c.height/2);

  // loop players
  var i = 0;
  for (const [key, value] of Object.entries(players)) {
    if(key == socket.id){
      continue;
    }
    console.log(key, value);
    var row = Math.floor(i / BOARDS_PER_ROW);
    var col = i % BOARDS_PER_ROW;
    console.log(row, col, h, BOARD_HEIGHT, VERTICAL_PADDING);
    var x = w * HORIZONAL_PADDING + col * w*BOARD_WIDTH;
    var y = h * VERTICAL_PADDING + row * h*BOARD_HEIGHT;

    canvasData[key] = {
      row: row,
      col: col,
      x: x,
      y: y,
      w: w*BOARD_WIDTH,
      h: h*BOARD_HEIGHT,
      username: value.username,
    }

    createEmptyBoard(key, ctx, x, y, w*BOARD_WIDTH, h*BOARD_HEIGHT);
    
    // loop through current guess data
    var gd = value.guesses
    if(gd){
      for(var i = 0; i < gd.length; i++){
        drawGuessRow(key, i);
      }
    }
    

    i += 1;
  }
}

function createEmptyBoard(id, ctx, x, y, w, h){
  console.log("createEmptyBoard", w, h, x, y);
  ctx.strokeStyle = "red";

  ctx.strokeRect(x, y, w, h);

  var HORIZONAL_PADDING = 0;//0.01*w;
  var VERTICAL_PADDING = 0;//0.01*h;
  var usernameHeight = 0.1*h;

  // create a grid of boxes based on length of word and max guesses
  // by using a for loop
  var gridHeight = h - VERTICAL_PADDING*2 - usernameHeight;
  var BOX_WIDTH = (w - 2 * HORIZONAL_PADDING) / wordLength;
  var BOX_HEIGHT = (gridHeight - 2 * VERTICAL_PADDING) / maxGuesses;
  console.log(wordLength, maxGuesses, BOX_HEIGHT, BOX_WIDTH);
  BOX_WIDTH = BOX_HEIGHT = Math.min(BOX_WIDTH, BOX_HEIGHT);

  canvasData[id].BOX_WIDTH = BOX_WIDTH;
  canvasData[id].BOX_HEIGHT = BOX_HEIGHT;
  canvasData[id].HORIZONAL_PADDING = HORIZONAL_PADDING;
  canvasData[id].VERTICAL_PADDING = VERTICAL_PADDING;
  var username = canvasData[id].username;

  for(var xi = 0; xi < wordLength; xi++){
    for(var yi = 0; yi < maxGuesses; yi++){
      ctx.strokeRect(x + (xi * BOX_WIDTH + HORIZONAL_PADDING), y + (yi * BOX_HEIGHT + VERTICAL_PADDING), BOX_WIDTH, BOX_HEIGHT);
      // ctx.fillStyle = "green";
      // ctx.strokeRect();
    }
  }

  ctx.font = "20px Arial";
  ctx.fillText(username, x + w/2 - (usernameHeight/2), y + gridHeight + VERTICAL_PADDING + usernameHeight);
}

function drawGuessRow(clientId, row){
  var x = canvasData[clientId].x;
  var y = canvasData[clientId].y;
  var BOX_WIDTH = canvasData[clientId].BOX_WIDTH;
  var BOX_HEIGHT = canvasData[clientId].BOX_HEIGHT;
  var HORIZONAL_PADDING = canvasData[clientId].HORIZONAL_PADDING;
  var VERTICAL_PADDING = canvasData[clientId].VERTICAL_PADDING;
  var yi = row;//canvasData[clientId].guessData.length;
  var letters = currentPlayers[clientId].guesses[row];
  for(var xi = 0; xi < wordLength; xi++){
    boardCtx.beginPath();
    boardCtx.rect(x + (xi * BOX_WIDTH + HORIZONAL_PADDING), y + (yi * BOX_HEIGHT + VERTICAL_PADDING), BOX_WIDTH, BOX_HEIGHT);
    console.log("Filling letter for other play ", letters[xi], letters);
    boardCtx.fillStyle = letters[xi] == 2 ? "green" :(letters[xi] == 1 ? "yellow" : "gray");
    boardCtx.closePath();
    boardCtx.fill();
  }
}

function resizeCanvas(){
  drawOtherPlayerBoards(currentPlayers);
}

window.addEventListener('resize', resizeCanvas, false);