import { icons, iconSvg } from './icons.js'

const card = document.getElementById('toast')
const badge = document.getElementById('badge')
const icon = document.getElementById('icon')
const status = document.getElementById('status')
const title = document.getElementById('title')
const message = document.getElementById('message')
let shown = false

window.orbitToast.onShow((_event, data) => {
  title.textContent = data.title
  message.textContent = data.message ?? ''
  message.hidden = !data.message
  // The action's own icon, with a corner mark saying how it went. Toasts that
  // aren't about an action show the mark itself instead.
  const mark = data.ok ? 'check' : 'alert'
  const hasIcon = Boolean(icons[data.icon]) && data.icon !== mark
  icon.replaceChildren(iconSvg(document, hasIcon ? data.icon : mark))
  status.replaceChildren(iconSvg(document, mark))
  status.hidden = !hasIcon
  const swatch = data.ok && data.icon === 'picker' ? data.message?.match(/#[0-9a-f]{6}\b/i)?.[0] : null
  badge.classList.toggle('is-swatch', Boolean(swatch))
  badge.style.background = swatch ?? ''
  card.classList.toggle('is-error', !data.ok)

  // A toast that arrives while one is up nudges in place instead of re-entering.
  card.classList.remove('is-bump', 'is-in')
  void card.offsetWidth
  card.classList.add(shown ? 'is-bump' : 'is-in')
  card.classList.add('is-shown')
  shown = true
})

window.orbitToast.onHide(() => {
  shown = false
  card.classList.remove('is-shown', 'is-in', 'is-bump')
})
