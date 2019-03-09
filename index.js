const fs = require(`fs`)
const {Builder, By, Key } = require(`selenium-webdriver`)
const inquirer = require(`inquirer`)
const sqlite = require(`sqlite`)
const DB_FILENAME = `.sqlitedb`
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
    await db.run(`CREATE TABLE IF NOT EXISTS visitors(id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, phone TEXT)`)
    await db.run(`CREATE TABLE IF NOT EXISTS cars(
        id INTEGER PRIMARY KEY,
        province TEXT,
        plate TEXT,
        visitor_id INTEGER,
        FOREIGN KEY (visitor_id) REFERENCES visitors(id)
    )`)

    const credentials = await db.all(`
        SELECT 
            email,
            lot,
            site_code AS siteCode,
            unit_number AS unitNumber
        FROM credentials
    `)
    
    const visitorCars = await db.all(`
        SELECT 
            cars.province AS province, 
            cars.plate AS plate,
            visitors.first_name AS firstName,
            visitors.last_name AS lastName,
            visitors.phone AS phone
        FROM cars
        INNER JOIN visitors ON cars.visitor_id = visitors.id
    `)

    let choiceDefaults = {
        credentials: {
            email: (credentials[0] && credentials[0].email) || '',
            lot: (credentials[0] && credentials[0].lot) || '',
            siteCode: (credentials[0] && credentials[0].siteCode) || '',
            unitNumber: (credentials[0] && credentials[0].unitNumber) || ''
        },
        visitorCars: [{ firstName: `OTHER`}].concat(visitorCars || [])
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
        },
        { 
            name: `whoToRegister`,
            message: `Which Person Do You Want to Register?`,
            type: `list`,
            choices: choiceDefaults.visitorCars.map(e => e.firstName === `OTHER` ? `OTHER` : `${e.firstName} ${e.lastName} - ${e.province} - ${e.plate}`)
        },
        {
            when: (res) => res.whoToRegister === `OTHER`,
            name: `newRegisterFirstName`,
            message: `New Registration: First Name?`,
        },
        {
            when: (res) => res.whoToRegister === `OTHER`,
            name: `newRegisterLastName`,
            message: `New Registration: Last Name?`,
        },
        {
            when: (res) => res.whoToRegister === `OTHER`,
            name: `newRegisterPhone`,
            message: `New Registration: Phone?`,
        },
        {
            when: (res) => res.whoToRegister === `OTHER`,
            type: `list`,
            name: `newRegisterProvince`,
            message: `New Registration: Vechicle Province?`,
            choices: PROVINCES
        },
        {
            when: (res) => res.whoToRegister === `OTHER`,
            name: `newRegisterPlate`,
            message: `New Registration: Vechicle Plate?`
        },
    ])

    if(choiceDefaults.credentials.email === ``) {
        await db.run(`DELETE FROM credentials`)
        await db.run(`INSERT INTO credentials(email, lot, site_code, unit_number) VALUES ("${promptChoices.email}", "${promptChoices.lot}", "${promptChoices.siteCode}", "${promptChoices.unitNumber}")`)
    }

    if(promptChoices.whoToRegister === `OTHER`) {
        await db.run(`
            INSERT 
                INTO visitors(first_name, last_name, phone)
            VALUES (
                "${promptChoices.newRegisterFirstName}",
                "${promptChoices.newRegisterLastName}",
                "${promptChoices.newRegisterPhone}"
            )`
        )

        await db.run(`
            INSERT 
                INTO cars(visitor_id, province, plate)
            VALUES (
                (
                    SELECT id from visitors 
                    WHERE
                    (
                        visitors.first_name = "${promptChoices.newRegisterFirstName}" 
                        AND 
                        visitors.last_name = "${promptChoices.newRegisterLastName}"
                    )
                ),
                "${promptChoices.newRegisterProvince}",
                "${promptChoices.newRegisterPlate}"
            )`
        )
        
        choiceDefaults.visitorCars.concat({
            firstName: promptChoices.newRegisterFirstName,
            lastName: promptChoices.newRegisterLastName,
            phone: promptChoices.newRegisterPhone,
            province: promptChoices.newRegisterProvince,
            plate: promptChoices.newRegisterPlate
        })
        promptChoices.whoToRegister = `${e.firstName} ${e.lastName} - ${e.province} - ${e.plate}`
    }

    const registerInfo = choiceDefaults.visitorCars.find(e => `${e.firstName} ${e.lastName} - ${e.province} - ${e.plate}` === promptChoices.whoToRegister)

    const driver = await new Builder().forBrowser(`chrome`).build()
    try {
        await driver.get(`https://visitorsparking.ca/`)
        await driver.findElement(By.css(`a[href*="userLogin"]`)).click()
        await driver.findElement(By.name(`user[login]`)).sendKeys(promptChoices.email)
        await driver.findElement(By.name(`user[password]`)).sendKeys(promptChoices.pw, Key.RETURN)
        await driver.wait(() => driver.findElement(By.xpath(`//*[contains(text(),"The Site Code may be obtained from the Property Manager. PLEASE PROVIDE THE FOLLOWING INFO")]`)).isDisplayed(),10000)
        await driver.findElement(By.name(`lots`)).sendKeys(promptChoices.lot)
        await driver.findElement(By.name(`site_code`)).clear()
        await driver.findElement(By.name(`site_code`)).sendKeys(promptChoices.siteCode)
        await driver.findElement(By.name(`unit_number`)).clear()
        await driver.findElement(By.name(`unit_number`)).sendKeys(promptChoices.unitNumber)
        await driver.findElement(By.name(`visitor_plate`)).clear()
        await driver.findElement(By.name(`visitor_plate`)).sendKeys(registerInfo.plate)
        await driver.findElement(By.name(`plate_location`)).sendKeys(registerInfo.province)
        await driver.findElement(By.name(`visitor_fname`)).clear()
        await driver.findElement(By.name(`visitor_fname`)).sendKeys(registerInfo.firstName)
        await driver.findElement(By.name(`visitor_lname`)).clear()
        await driver.findElement(By.name(`visitor_lname`)).sendKeys(registerInfo.lastName)
        await driver.findElement(By.name(`visitor_phone`)).clear()
        await driver.findElement(By.name(`visitor_phone`)).sendKeys(registerInfo.phone)
        await driver.sleep(3000)
        // await driver.findElement(By.name(`passType[1]`)).click()
        await driver.sleep(1000)
    } finally {
        await driver.quit()
    }
}
main()