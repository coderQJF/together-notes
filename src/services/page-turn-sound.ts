const PAGE_TURN_WAV = 'UklGRiQFAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAFAABxy3R8djuGgJG9fXdgQldtfZHJfJ9phmazqIBgVUl4lmmmj6VeiY6TunCMk5N5Rp2gtpSbbWtiaKB1jW+Ua4B3po6Lk0lQaZSrhYGdTE1ef5erbqVbZXeAq8C0cJB4Rl6Ai7mgbUl9iY6ygpKwiF4/k3CYg7ZnhVJSW2OSeqpnUlh4mZh9i5pYflFmoaBwjohiUoqMp5qgrZxnjEZ6c5qXcopQdFaMgn6Pi4uBW3VRd41zj2NofG16apeEqpBkgFNzc6eIeW2KZmGIYomRkJFyfFFrVoh2jXqAinJReXdphoujc29XYW5rfG6PhnRxbIx/j4KGjoCelXNjXJaZopZ/lHRpXnmMloiTeIGSdHpyXmWhgX6choh7iYCNk4x8j3CFd25XfGt5p4CamHyCbXJ0g3aLl46XbIlYfGp3np9+fnyEaHeChnpzjZd5iWNjf318j4SYnJCUcIGEg4Jtf4aEnYd+gYGJaHBteZGKf3N/iGpwZn+BdaF6nnuMdoB6eGaKiZufiYaKiHNnfWxzgpifdnyGhnFuiHuOe4J6l3l6hWiHfnSGbneIho2Cjot1bmdnf4CPhJ2OhY+QZ2x1Yn2Dk416kYGIg3l9dX2Ei4mSjId+joB4dGdxfISIeZaUlI6Kkoh7emWAdoyNgYmAh3uQi3WJeYdyhHiDdpeGhpBzi2uGc4FviW9/d4WBf4yNh4Z4aYV9hnd8g398kYKRintvhH56fIVvhJGGiYp+en6LfXZ7boNvgX6Dent/iH6OfYh+gICBgW59dXiLe4mOfXl7eHGFgnZ4boR6doSPhJN/iHt7goh7g32Bd4SBdoV9hX1+kId5eXx9dHJxgGyCfYCHfY2Ee4R9iX95hn99cXiAf4GAb4F5d4GGiH5+iIF8dnl2hnF4d3GDdHiFdnt8gIGBgXx+j395hod+foVzcoJ3hYiCeIqOeo2Bg4p6fX2BgoV0dnxxfX1wfXZ1fYiJiYR9g4aOinqLiYh9f3l8gHeBd3t3gX57hn2EfIF/jIx9i4SEfnqFeId1eHqBgnt2c3t1enmGdneEfX2CjH6Ng4R8h4iIhYiHfoKEdn90gXp3e4N/gXp+dn+Hh4WFfYiDgYCCgYB/g4B7foJ+goJ+hXh3eIB8d398eXmCe4B7fX93hYWCen99e4KFgYSLi4KCgX6IfoB7iXx9hXx7e3qAhIR4foN4dnd+gIF8gXt9fX55eYOBgn99g3mGfIWGh4J7hYiHiIV/fYWEgIGBhIGFgICEhomGg4CFfn2Eg4GFhHuAhIKAfX98gH18f4N+fnt9gHeDf3d/gn59gHx+end4fnl7e3h7en+AfX56d3x5f4B/e356gHh/e3d4f354gn+CeoF7eYF+gn1+e3x9gX57fYF+gIF+eYCAgIB5gIF5fHp4foGAfXt6eHp5eX9/fYB8gXp7gYCBe3l5eHp+fXx7eXuCfX18fIJ+eXt7gH19fIF8f4F8g3x+gX5/gnx/foKBg4B+hYCDhIN/gIZ+gYF+foOGgIWFfn6Bgn+BhIKEfX+Afn98gHt+goKAgIF/fnp/f3x6fYB/f319e3t8fYJ+gn5+goKAgIGAg4SFfn9+gYKCgX6BfoKDgYJ+gYF8fn5+fHt/fn6Af39/gn2BgX6AfoCAgoOAgX6BgYCBf4KEg319fYCAfn1/fnyAf4CAgYB/gX2Bf3+DgIGBf4N/gYJ/f4KAgA=='

let audio: ReturnType<typeof uni.createInnerAudioContext> | undefined
let sourcePromise: Promise<string> | undefined

function appAudioSource() {
  return new Promise<string>((resolve, reject) => {
    plus.io.requestFileSystem(plus.io.PRIVATE_DOC, fileSystem => {
      const root = fileSystem.root
      if (!root) { reject(new Error('PAGE_TURN_AUDIO_STORAGE_UNAVAILABLE')); return }
      root.getFile('reader-page-turn.wav', { create: true }, entry => {
        entry.file(file => {
          if (Number(file.size || 0) > 0) { resolve(entry.toLocalURL()); return }
          entry.createWriter(writer => {
            writer.onwrite = () => resolve(entry.toLocalURL())
            writer.onerror = reject
            writer.writeAsBinary(atob(PAGE_TURN_WAV))
          }, reject)
        }, reject)
      }, reject)
    }, reject)
  })
}

function audioSource() {
  if (sourcePromise) return sourcePromise
  // #ifdef APP-PLUS
  sourcePromise = appAudioSource()
  // #endif
  // #ifndef APP-PLUS
  sourcePromise = Promise.resolve(`data:audio/wav;base64,${PAGE_TURN_WAV}`)
  // #endif
  return sourcePromise
}

export function preparePageTurnSound() {
  return audioSource().catch(() => '')
}

export async function playPageTurnSound(enabled: boolean) {
  if (!enabled) return
  try {
    const src = await audioSource()
    if (!src) return
    if (!audio) {
      audio = uni.createInnerAudioContext()
      audio.volume = 0.28
      audio.obeyMuteSwitch = true
    }
    audio.stop()
    audio.src = src
    audio.play()
  } catch {
    // Audio is decorative; chapter navigation must never depend on it.
  }
}

export function destroyPageTurnSound() {
  audio?.destroy()
  audio = undefined
}
