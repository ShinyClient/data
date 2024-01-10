import Config from "../Config"

let phase = 1
let lastCompleted = [0, 7] // [completed, total]
let gateBlown = false
let phaseStarted = null
let times = []

const newPhase = () => {
    let secs = Math.floor((new Date().getTime() - phaseStarted)/10)/100
    times.push(secs)
    phaseStarted = new Date().getTime()
    phase++
    gateBlown = false
    lastCompleted = [0, 7]
}

register("chat", (completed, total) => {
    completed = parseInt(completed)
    total = parseInt(total)
    if (completed < lastCompleted[0] || (completed == total && gateBlown)) return newPhase()
    lastCompleted = [completed, total]
}).setCriteria(/.+ [activated|completed]+ a .+! \((\d)\/(\d)\)/)

register("chat", () => {
    if (lastCompleted[0] == lastCompleted[1]) newPhase()
    else gateBlown = true
}).setCriteria("The gate has been destroyed!")

register("chat", () => {
    if (!Config.terminalSplits) return
    newPhase()
    let msg = times.reduce((a,b,i) => a+`&2${i+1}: &a${b} &8| `, "&dTerminals: ")+`&6Total: ${Math.floor(times.reduce((a, b) => a+b, 0)*100)/100}`
    new TextComponent(msg).setClick("run_command", `/ct copy ${msg.removeFormatting()}`).chat()
}).setCriteria("The Core entrance is opening!")

register("chat", () => {
    phaseStarted = new Date().getTime()
}).setCriteria("[BOSS] Goldor: Who dares trespass into my domain?")

register("worldLoad", () => {
    phase = 1
    lastCompleted = [0, 7]
    gateBlown = false
    phaseStarted = null
    times = []
})