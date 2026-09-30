const toast = document.getElementById('toast')
const title = document.getElementById('title')
const message = document.getElementById('message')

window.toast.onShow((_event, data) => {
  title.textContent = data.title
  message.textContent = data.message
  toast.classList.toggle('is-error', !data.ok)
  toast.classList.remove('is-shown')
  requestAnimationFrame(() => toast.classList.add('is-shown'))
})

window.toast.onHide(() => {
  toast.classList.remove('is-shown')
})
