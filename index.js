require('chromedriver')
const {Builder, By, Key } = require(`selenium-webdriver`)
const inquirer = require(`inquirer`)
const sqlite = require(`sqlite`)
const DB_FILENAME = `.db.sqlite`
const PROVINCES = [
    `Alberta`,
    `British Columbia`,
    `Manitoba`,
    `New Brunswick`,
    `Newfoundland and Labrador`,
    `Northwest Territories`,
    `Nova Scotia`,
    `Nunavut`,
    `Ontario`,
    `Prince Edward Island`,
    `Quebec`,
    `Saskatchewan`,
    `Yukon`
]



const main = async () => {
    const db = await sqlite.open(DB_FILENAME, { Promise })
    await db.run(`CREATE TABLE IF NOT EXISTS credentials(id INTEGER PRIMARY KEY, email TEXT, lot TEXT, site_code TEXT, unit_number TEXT)`)
    await db.run(`CREATE TABLE IF NOT EXISTS cars(
        id INTEGER PRIMARY KEY,
        name TEXT,
        province TEXT,
        plate TEXT,
        visitor_id INTEGER
        )`)

        const credentials = await db.all(`
        SELECT
        email,
        lot,
        site_code AS siteCode,
        unit_number AS unitNumber
        FROM credentials
        `)

        const cars = await db.all(`
        SELECT
        name,
        province,
        plate
        FROM cars
        `)

        let choiceDefaults = {
            credentials: {
                email: (credentials[0] && credentials[0].email) || '',
                lot: (credentials[0] && credentials[0].lot) || '',
                siteCode: (credentials[0] && credentials[0].siteCode) || '',
                unitNumber: (credentials[0] && credentials[0].unitNumber) || ''
            },
            cars: (cars || []).concat([{ firstName: `OTHER`}])
        }

        let promptChoices = await inquirer.prompt([
            {
                name: `email`,
                message: `Login Email?`,
                default: choiceDefaults.credentials.email
            },
            {
                name: `pw`,
                message: `Login Password?`,
                type: `password`
            },
            {
                name: `lot`,
                message: `Lot Region?`,
                default: choiceDefaults.credentials.lot
            },
            {
                name: `siteCode`,
                message: `Site Code?`,
                default: choiceDefaults.credentials.siteCode
            },
            {
                name: `unitNumber`,
                message: `Unit Number?`,
                default: choiceDefaults.credentials.unitNumber
            }
        ])

        if(choiceDefaults.credentials.email === `` || (choiceDefaults.credentials.email !== promptChoices.email)) {
            await db.run(`DELETE FROM credentials`)
            await db.run(`INSERT INTO credentials(email, lot, site_code, unit_number) VALUES ("${promptChoices.email}", "${promptChoices.lot}", "${promptChoices.siteCode}", "${promptChoices.unitNumber}")`)
        }


        Object.assign(promptChoices, await inquirer.prompt([
            {
                name: `whoToRegister`,
                message: `Which Person Do You Want to Register?`,
                type: `list`,
                choices: choiceDefaults.cars.map(e => e.firstName === `OTHER` ? `OTHER` : `${e.name} - ${e.province} - ${e.plate}`)
            },
            {
                name: `newRegisterName`,
                message: `New Registration: Name?`,
                when: (res) => res.whoToRegister === `OTHER`,
            },
            {
                name: `newRegisterProvince`,
                message: `New Registration: Vechicle Province?`,
                type: `list`,
                when: (res) => res.whoToRegister === `OTHER`,
                choices: PROVINCES
            },
            {
                name: `newRegisterPlate`,
                message: `New Registration: Vechicle Plate?`,
                when: (res) => res.whoToRegister === `OTHER`,
            },
        ]))
        if(promptChoices.whoToRegister === `OTHER`) {
            await db.run(`
            INSERT
            INTO cars(name, province, plate)
            VALUES (
                "${promptChoices.newRegisterName}",
                "${promptChoices.newRegisterProvince}",
                "${promptChoices.newRegisterPlate}"
                )`
                )

                choiceDefaults.cars.concat({
                    name: promptChoices.newRegisterName,
                    province: promptChoices.newRegisterProvince,
                    plate: promptChoices.newRegisterPlate
                })
                promptChoices.whoToRegister = `${promptChoices.newRegisterName} - ${promptChoices.newRegisterProvince} - ${promptChoices.newRegisterPlate}`
            }

            const registerInfo = choiceDefaults.cars.find(e => `${e.name} - ${e.province} - ${e.plate}` === promptChoices.whoToRegister)

            const driver = await new Builder().forBrowser(`chrome`).build()
            try {
                await driver.get(`https://visitorsparking.ca/`)
                await driver.findElement(By.css(`a[href*="userLogin"]`)).click()
                await driver.findElement(By.name(`user[login]`)).sendKeys(promptChoices.email)
                await driver.findElement(By.name(`user[password]`)).sendKeys(promptChoices.pw, Key.RETURN)
                try {
                    await driver.wait(() => driver.findElement(By.xpath(`//*[contains(text(),"The Site Code may be obtained from the Property Manager. PLEASE PROVIDE THE FOLLOWING INFO")]`)).isDisplayed(),10000)
                } catch (e) {
                    console.warn(`ERROR: Unable to login. Check credentials and try again`)
                }
                await driver.findElement(By.name(`lots`)).sendKeys(promptChoices.lot)
                await driver.findElement(By.name(`site_code`)).sendKeys(promptChoices.siteCode)
                await driver.findElement(By.name(`unit_number`)).sendKeys(promptChoices.unitNumber)
                await driver.findElement(By.name(`visitor_plate`)).sendKeys(registerInfo.plate)
                await driver.findElement(By.name(`plate_location`)).sendKeys(registerInfo.province)
                await driver.sleep(3000)
                await driver.findElement(By.name(`passType[1]`)).click()
                await driver.sleep(1000)
            } finally {
                await driver.quit()
            }
        }
        main().catch(e => console.log())