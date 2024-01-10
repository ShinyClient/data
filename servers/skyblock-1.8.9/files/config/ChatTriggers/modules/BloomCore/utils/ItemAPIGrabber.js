import request from "../../requestV2"
import { bcData } from "./Utils"

register("gameLoad", () => {
    if (new Date().getTime() - bcData.lastItemUpdate < 1.2e6) return
    bcData.lastItemUpdate = new Date().getTime()
    bcData.save()

    request({url: "https://api.hypixel.net/resources/skyblock/items", json: true}).then(data => {
        if (!data.success) return
        FileLib.write("BloomCore", "data/skyblockItems.json", JSON.stringify(data.items, null, 4), true)
    })
})