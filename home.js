(function () {
  const { sb } = window.Stories;
  sb.from("veterans").select("id", { count: "exact", head: true }).eq("status", "approved").then(({ count }) => {
    if (count) document.getElementById("storyCount").textContent =
      `${count} ${count === 1 ? "Veteran has" : "Veterans have"} shared their stories so far.`;
  });
})();
