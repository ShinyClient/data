import request from "../requestV2"
import { NBTTagString, bcData, getSbApiItemData } from "./utils/Utils"

const bzFilePath = "data/bz.json"
const binFilePath = "data/bins.json"

const masterStars = [
    "FIRST_MASTER_STAR",
    "SECOND_MASTER_STAR",
    "THIRD_MASTER_STAR",
    "FOURTH_MASTER_STAR",
    "FIFTH_MASTER_STAR"
]

export default new class PriceUtils {
    constructor() {
        this.bins = new Map()
        this.bzBuyPrices = new Map()
        this.bzSellPrices = new Map()

        this.locations = {
            AUCTION: 0,
            BAZAAR: 1
        }

        // Read data from file
        this.loadFromBZFile()
        this.loadFromBinFile()

        // Update the prices every 20 mins
        register("tick", () => {
            if (new Date().getTime() - bcData.priceUtilsLastUpdated < 1.2e6) return
            bcData.priceUtilsLastUpdated = new Date().getTime()
            bcData.save()
            this.update()
        })
    }

    /**
     * Loads the last saved bazaar buy/sell prices from file.
     */
    loadFromBZFile() {
        if (!FileLib.exists("BloomCore", bzFilePath)) return
        const bzData = JSON.parse(FileLib.read("BloomCore", bzFilePath))
        Object.entries(bzData).forEach(([k, v]) => {
            this.bzBuyPrices.set(k, v.buy)
            this.bzSellPrices.set(k, v.sell)
        })
    }

    /**
     * Loads the last saved BINs from file.
     */
    loadFromBinFile() {
        if (!FileLib.exists("BloomCore", binFilePath)) return
        const binData = JSON.parse(FileLib.read("BloomCore", binFilePath))
        Object.entries(binData).forEach(([k, v]) => {
            this.bins.set(k, v)
        })
    }

    /**
     * Requests Hypixel's Bazaar API and Moulberry's lowestbin.json file and updates the price data.
     */
    update() {
        // Update Bazaar Prices
        request({url: "https://api.hypixel.net/skyblock/bazaar", json: true}).then(data => {
            if (!data.success || !("products" in data)) return
            let prices = Object.keys(data.products).reduce((a, b) => {
                const p = data.products[b]
                a[b] = {
                    buy: p.quick_status.buyPrice,
                    sell: p.quick_status.sellPrice
                }
                return a
            }, {})
            FileLib.write("BloomCore", bzFilePath, JSON.stringify(prices, null, 4), true)
            this.loadFromBZFile()
        })

        // Update BINs
        request({url: "https://moulberry.codes/lowestbin.json", json: true}).then(data => {
            FileLib.write("BloomCore", binFilePath, JSON.stringify(data, null, 4), true)
            this.loadFromBinFile()
        })
    }

    /**
     * Gets the buy price or BIN or a Skyblock item.
     * If includeLocation is true, it will return something like [ITEM_PRICE, PriceUtils.locations.BAZAAR] or null if no price is found
     * @param {String} skyblockID 
     * @param {Boolean} includeLocation
     * @returns {Number | Array | null}
     */
    getPrice(skyblockID, includeLocation=false) {
        if (this.bzBuyPrices.has(skyblockID)) {
            if (includeLocation) return [
                this.bzBuyPrices.get(skyblockID),
                this.locations.BAZAAR
            ]
            return this.bzBuyPrices.get(skyblockID)
        }
        if (this.bins.has(skyblockID)) {
            if (includeLocation) return [
                this.bins.get(skyblockID),
                this.locations.AUCTION
            ]
            return this.bins.get(skyblockID)
        }
        return null
    }
    
    /**
     * Gets the sell price or lowest BIN of a Skyblock item.
     * If includeLocation is true, it will return something like [ITEM_PRICE, PriceUtils.locations.BAZAAR] or null if no price is found
     * @param {String} skyblockID 
     * @param {Boolean} includeLocation
     * @returns {Number | Array | null}
     */
    getSellPrice(skyblockID, includeLocation=false) {
        if (this.bzSellPrices.has(skyblockID)) {
            if (includeLocation) return [
                this.bzSellPrices.get(skyblockID),
                this.locations.BAZAAR
            ]
            return this.bzSellPrices.get(skyblockID)
        }
        if (this.bins.has(skyblockID)) {
            if (includeLocation) return [
                this.bins.get(skyblockID),
                this.locations.AUCTION
            ]
            return this.bins.get(skyblockID)
        }
        return null
    }

    /**
     * Gets the coins required to upgrade by the given requirements (Using the hypixel Skyblock items API data).
     * @param {*} requirements 
     * @returns 
     */
    getUpgradeCost(requirements) {
        let cost = 0
        for (let upgrade of requirements) {
            let type = upgrade.type
            let amount = upgrade.amount ?? 1

            if (type == "ESSENCE") cost += (this.getPrice(`ESSENCE_${upgrade.essence_type}`) ?? 0) * amount
            else if (type == "ITEM") cost += (this.getPrice(upgrade.item_id) ?? 0) * amount
            else if (type == "COINS") cost += amount
        }
        return cost
    }

    /**
     * Returns the value of an item taking into account gemstones, recombs, enchants etc.
     * @param {MCTItemStack} itemStack
     * @param {Boolean} returnBreakdown - Returns an object containing a breakdown of the costs of each part of the item. Will return [value, breakdownObject]
     * @returns {Number | [Number, Object]}
     */
    getItemValue(itemStack, returnBreakdown=false) {

        // Note to past self:
        // Why the fuck did you decide that it was a good idea to use the Minecraft nbt
        // classes, and NOT THE FUCKING CT WRAPPER OR .toObject/??????
        // If I had a time machine I would go back and kick your ass for doing it this way.
        if (itemStack instanceof Item) itemStack = itemStack.itemStack
        
        const nbt = itemStack.func_77978_p()

        if (!nbt || !nbt.func_74764_b("ExtraAttributes")) return null
        const extraAttributes = nbt.func_74775_l("ExtraAttributes")

        // The breakdown of where the value of this item comes from
        const values = {}
        let itemID = null
        
        // The item itself
        if (extraAttributes.func_74764_b("id")) itemID = extraAttributes.func_74779_i("id")
        let itemJson = getSbApiItemData(itemID)
        
        values.base = this.getPrice(itemID) ?? 0

        // Recomb
        if (extraAttributes.func_74764_b("rarity_upgrades")) {
            values.recomb = (extraAttributes.func_74762_e("rarity_upgrades") ?? 0) * this.getPrice("RECOMBOBULATOR_3000")
        }

        // Runes
        if (extraAttributes.func_74764_b("runes")) {
            const runes = extraAttributes.func_74775_l("runes")
            const keys = runes.func_150296_c()
            keys.forEach(k => {
                const runeLevel = runes.func_74762_e(k)
                if (!("runes" in values)) values.runes = 0

                values.runes += this.getPrice(`${k}_RUNE;${runeLevel}`) ?? 0
            })
        }

        // Scrolls
        if (extraAttributes.func_74764_b("ability_scroll")) {
            const scrolls = extraAttributes.func_150295_c("ability_scroll", 8)
            values.scrolls = 0
            for (let i = 0;;i++) {
                let scroll = scrolls.func_150307_f(i)
                if (!scroll) break
                values.scrolls += this.getPrice(scroll) ?? 0
            }
        }

        // Hot potato books and fumings
        if (extraAttributes.func_74764_b("hot_potato_count")) {
            const hpbs = extraAttributes.func_74762_e("hot_potato_count")
            let hot = hpbs
            let fumings = 0
            if (hpbs > 10) {
                hot = 10
                fumings = hpbs - 10
            }
            values.hpb = (this.getPrice("HOT_POTATO_BOOK") ?? 0) * hot
            if (fumings) values.fuming = (this.getPrice("FUMING_POTATO_BOOK") ?? 0) * fumings
        }

        // Dungeon Stars etc
        let upgrades = 0
        if (extraAttributes.func_74764_b("dungeon_item_level")) upgrades = extraAttributes.func_74762_e("dungeon_item_level")
        else if (extraAttributes.func_74764_b("upgrade_level")) upgrades = extraAttributes.func_74762_e("upgrade_level")

        if (upgrades && itemID && itemJson) {
            const upgradeCosts = itemJson.upgrade_costs

            values.upgrades = 0

            // Is a dungeon item, can have master stars
            if (upgrades > upgradeCosts.length && extraAttributes.func_74764_b("dungeon_item") && extraAttributes.func_74762_e("dungeon_item") == 1) {
                const mStars = upgrades - upgradeCosts.length
                values.masterStars = 0
                masterStars.slice(0, mStars).forEach(star => {
                    values.masterStars += this.getPrice(star) ?? 0
                })
                upgrades = upgradeCosts.length
            }

            // Normal stars and other upgrades
            upgradeCosts.slice(0, upgrades).forEach(tier => {
                values.upgrades += this.getUpgradeCost(tier)
            })
        }

        // Enchantments value
        if (extraAttributes.func_74764_b("enchantments")) {
            const enchants = extraAttributes.func_74775_l("enchantments")
            const keys = enchants.func_150296_c()

            values.enchants = 0

            keys.forEach(k => {
                const enchantLevel = enchants.func_74762_e(k)
                let enchantPrice = this.getPrice(`ENCHANTMENT_${k.toUpperCase()}_${enchantLevel}`) ?? 0

                if (k == "efficiency" && enchantLevel > 5) {
                    enchantPrice = (this.getPrice("SIL_EX") ?? 0) * (enchantLevel - 5)
                }

                // Scavenger 5 is worthless on dropped dungeon loot
                if (k == "scavenger" && extraAttributes.func_74764_b("baseStatBoostPercentage")) {
                    enchantPrice = 0
                }
                
                values.enchants += enchantPrice
            })
        }

        // Gemstones and unlocking slots
        // BROKEN: WILL FIX EVENTUALLY
        if (extraAttributes.func_74764_b("gems")) {
            const gems = extraAttributes.func_74775_l("gems")
            const keys = gems.func_150296_c()

            // Cost to unlock the gemstone slots in the first place
            if (gems.func_74764_b("unlocked_slots") && itemJson) {
                const unlockedSlots = gems.func_150295_c("unlocked_slots", 8)
                values.gemstoneUnlocks = 0
                for (let i = 0;;i++) {
                    let slot = unlockedSlots.func_150307_f(i)
                    if (!slot) break
                    let match = slot.match(/^(\w+)_(\d+)$/)
                    if (!match) continue
                    let [_, type, index] = match
                    index = parseInt(index)
                    for (let slot of itemJson.gemstone_slots) {
                        if (slot.slot_type !== type) continue
                        if (index > 0) {
                            index--
                            continue
                        }
                        values.gemstoneUnlocks += this.getUpgradeCost(slot.costs)
                    }
                }
            }

            // The cost of the actual gemstones
            values.gemstones = 0

            keys.forEach(k => {
                const tag = gems.func_74779_i(k)
                if (!tag) return

                let gemQuality = null
                let gem = null

                // Looks for "JASPER_0", "RUBY_0" etc
                const match1 = k.match(/^(\w+)_\d+$/)
                if (match1) {
                    let [_, gemType] = match1
                    gemQuality = tag
                    gem = gemType
                }
                
                // Looks for "COMBAT_0_gem" etc
                const match2 = k.match(/^(\w+)_(\d+)_gem$/)
                if (match2) {
                    let [_, type, slot] = match2
                    thing = gems.func_74779_i(`${type}_${slot}`)
                    gem = tag
                    gemQuality = thing
                }

                if (!gem || !gemQuality) return

                values.gemstones += this.getPrice(`${gemQuality.toUpperCase()}_${gem.toUpperCase()}_GEM`) ?? 0
            })
        }

        // Dyes
        if (extraAttributes.func_74764_b("dye_item")) {
            const dye = extraAttributes.func_74779_i("dye_item")
            values.dye = this.getPrice(dye) ?? 0
        }
        
        // Etherwarp
        if (extraAttributes.func_74764_b("ethermerge")) {
            values.etherwarp = (this.getPrice("ETHERWARP_MERGER") ?? 0) + (this.getPrice("ETHERWARP_CONDUIT") ?? 0) 
        }

        // Transmission Tuners
        if (extraAttributes.func_74764_b("tuned_transmission")) {
            const tuners = extraAttributes.func_74762_e("tuned_transmission")
            values.transmissionTuners = (this.getPrice("TRANSMISSION_TUNER") ?? 0) * tuners
        }

        if (extraAttributes.func_74764_b("art_of_war_count")) {
            values.artOfWar = (this.getPrice("THE_ART_OF_WAR") ?? 0) * extraAttributes.func_74762_e("art_of_war_count")
        }

        const totalValue = Object.values(values).reduce((a, b) => a + b, 0)
        
        if (returnBreakdown) return [totalValue, values]
        return totalValue
    }
}