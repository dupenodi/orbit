const card = document.getElementById('toast')
const title = document.getElementById('title')
const message = document.getElementById('message')

window.orbitToast.onShow((_event, data) => {
  title.textContent = data.title
  message.textContent = data.message
  card.classList.toggle('is-error', !data.ok)
  card.classList.remove('is-shown')
  requestAnimationFrame(() => card.classList.add('is-shown'))
})

window.orbitToast.onHide(() => {
  card.classList.remove('is-shown')
})
