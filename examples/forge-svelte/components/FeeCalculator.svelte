<script>
  export let hourlyRate = 18;
  export let materialsFee = 12;
  let people = 2;
  let hours = 3;
  $: total = people * hours * hourlyRate + people * materialsFee;
</script>

<div class="fee-calc">
  <label>People <input type="number" bind:value={people} min="1" max="8"></label>
  <label>Hours <input type="number" bind:value={hours} min="2" max="6"></label>
  <p>Estimated cost: £{total}</p>
</div>
