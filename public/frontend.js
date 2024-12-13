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
  //TODO: Fix this to add the new poll to the page

  const pollContainer = document.getElementById("polls");

  //Poll Structure
  const newPoll = document.createElement("li");
  newPoll.classList.add("poll-container");
  newPoll.innerHTML = `                                 
        <h2>
        <%= ${data.question} %>
    </h2>
    <form class="pollForm">
        <ul class="poll-options">
            <li>Option 1: <%= ${data.option1} %>
                    <input type="hidden" name="poll-id" value="<%= ${data.id} %>">
                    <button type="submit" name="option" value="option1"
                        class="voteButton">Vote</button>
            </li>
            <li>Option 2: <%= ${data.option2} %>
                    <input type="hidden" name="poll-id" value="<%= ${data.id} %>">
                    <button type="submit" name="option" value="option2"
                        class="voteButton">Vote</button>
            </li>
        </ul>
    </form>
    `;

  //Append to container
  pollContainer.appendChild(newPoll);

  //Event listener for voting
  newPoll.querySelector(".poll-form").addEventListener("submit", onVoteClicked);
}

/**
 * Handles updating the number of votes an option has when a new vote is recieved from the server
 *
 * @param {*} data The data from the server (probably containing which poll was updated and the new vote values for that poll)
 */

//Update votes displayed
function onIncomingVote(data) {
  const { pollId, option, votes } = data;
  const voteElement = document.getElementById(`votes-${pollId}-${option}`);
  if (voteElement) {
    voteElement.textContent = votes;
  }
}

/**
 * Handles processing a user's vote when they click on an option to vote
 *
 * @param {FormDataEvent} event The form event sent after the user clicks a poll option to "submit" the form
 */
function onVoteClicked(event) {
  event.preventDefault();
  const formData = new FormData(event.target);

  const pollId = formData.get("poll-id");
  const selectedOption = formData.get("option");

  //Send vote
  socket.send(
    JSON.stringify({ type: "vote", pollId: pollId, option: selectedOption })
  );
}

//Adds a listener to each existing poll to handle things when the user attempts to vote
document.querySelectorAll(".poll-form").forEach((pollForm) => {
  pollForm.addEventListener("submit", onVoteClicked);
});
