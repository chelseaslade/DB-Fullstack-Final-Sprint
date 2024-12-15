// Establish a WebSocket connection to the server
const socket = new WebSocket("ws://localhost:3000/ws");

// Listen for messages from the server
socket.addEventListener("message", (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "newPoll") {
    onNewPollAdded(data);
  } else if (data.type === "voteUpdate") {
    onIncomingVote(data);
  }
});

/**
 * Handles adding a new poll to the page when one is received from the server
 *
 * @param {*} data The data from the server (ideally containing the new poll's ID and it's corresponding questions)
 */
function onNewPollAdded(data) {
  const pollContainer = document.getElementById("polls");

  const newPoll = document.createElement("li");
  newPoll.classList.add("poll-container");
  newPoll.innerHTML = `
        <h2>${data.question}</h2>
        <form class="pollForm">
            <ul class="poll-options">
                <li>Option 1: ${data.option1}
                    <input type="hidden" name="poll-id" value="${data.id}">
                    <button type="submit" name="option" value="option1" class="voteButton">Vote</button>
                </li>
                <li>Option 2: ${data.option2}
                    <input type="hidden" name="poll-id" value="${data.id}">
                    <button type="submit" name="option" value="option2" class="voteButton">Vote</button>
                </li>
            </ul>
        </form>
    `;

  pollContainer.appendChild(newPoll);

  // Add event listener for voting
  newPoll.querySelector(".pollForm").addEventListener("submit", onVoteClicked);
}

/**
 * Handles updating the number of votes an option has when a new vote is recieved from the server
 *
 * @param {*} data The data from the server (probably containing which poll was updated and the new vote values for that poll)
 */

//Update votes displayed
function onIncomingVote(data) {
  const pollContainer = document.getElementById("polls");
  const pollElement = pollContainer
    .querySelector(`[name="poll-id"][value="${data.pollId}"]`)
    .closest(".poll-container");

  const optionElement = pollElement.querySelector(
    `.voteButton[value="${data.option}"]`
  ).parentElement;

  const voteCountSpan = optionElement.querySelector(".vote-count");
  if (voteCountSpan) {
    voteCountSpan.textContent = `Votes: ${data.votes}`;
  } else {
    const voteCount = document.createElement("span");
    voteCount.classList.add("vote-count");
    voteCount.textContent = `Votes: ${data.votes}`;
    optionElement.appendChild(voteCount);
  }
}

/**
 * Handles processing a user's vote when they click on an option to vote
 *
 * @param {FormDataEvent} event The form event sent after the user clicks a poll option to "submit" the form
 */
function onVoteClicked(event) {
  event.preventDefault();
  console.log("Vote button clicked!");

  const form = event.target;
  const formData = new FormData(form);

  // Log form data for debugging
  formData.forEach((value, key) => {
    console.log(`FormData: ${key} = ${value}`);
  });

  // Extract poll ID and selected option
  const pollId = formData.get("poll-id");
  const selectedOption = formData.get("option");

  // Use the globally defined `username` variable from EJS
  console.log("Sending vote:", pollId, selectedOption, username);

  if (!pollId || !selectedOption || !username) {
    console.error(
      "Missing vote data. Ensure poll ID, option, and username are defined."
    );
    return;
  }

  // Send vote data to the WebSocket server
  socket.send(
    JSON.stringify({
      type: "vote",
      pollId: pollId,
      option: selectedOption,
      username: username, // This is fetched from the EJS template
    })
  );
}

//Adds a listener to each existing poll to handle things when the user attempts to vote
document.querySelectorAll(".pollForm").forEach((pollForm) => {
  pollForm.addEventListener("submit", onVoteClicked);
});
