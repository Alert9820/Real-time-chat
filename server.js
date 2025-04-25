<script>
  function sendMessage() {
    const input = document.getElementById("user-input").value.trim();
    if (!input) return;

    // Show user message
    const chatBox = document.getElementById("chat-box");
    const userMsg = document.createElement("div");
    userMsg.className = "message user";
    userMsg.textContent = "You: " + input;
    chatBox.appendChild(userMsg);

    // Clear input
    document.getElementById("user-input").value = "";

    // Send prompt to your own server
    fetch("https://your-render-app.onrender.com/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: input })
    })
    .then(res => res.json())
    .then(data => {
      const botText = data.text || "No response.";
      const botMsg = document.createElement("div");
      botMsg.className = "message bot";
      botMsg.textContent = "Bot: " + botText;
      chatBox.appendChild(botMsg);
      chatBox.scrollTop = chatBox.scrollHeight;
    })
    .catch(err => {
      const errorMsg = document.createElement("div");
      errorMsg.className = "message bot";
      errorMsg.textContent = "Bot: Error occurred!";
      chatBox.appendChild(errorMsg);
      chatBox.scrollTop = chatBox.scrollHeight;
      console.error(err);
    });
  }
</script>
