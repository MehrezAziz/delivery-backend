import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GOVERNORATES: Record<string, string[]> = {
  TN: ['Tunis','Ariana','Ben Arous','Manouba','Nabeul','Zaghouan','Bizerte','Beja','Jendouba','Kef','Siliana','Sousse','Monastir','Mahdia','Sfax','Kairouan','Kasserine','Sidi Bouzid','Gabes','Medenine','Tataouine','Gafsa','Tozeur','Kebili'],
  DZ: ['Adrar','Chlef','Laghouat','Oum El Bouaghi','Batna','Bejaia','Biskra','Bechar','Blida','Bouira','Tamanrasset','Tebessa','Tlemcen','Tiaret','Tizi Ouzou','Algiers','Djelfa','Jijel','Setif','Saida','Skikda','Sidi Bel Abbes','Annaba','Guelma','Constantine','Medea','Mostaganem','MSila','Mascara','Ouargla','Oran','El Bayadh','Illizi','Bordj Bou Arreridj','Boumerdes','El Tarf','Tindouf','Tissemsilt','El Oued','Khenchela','Souk Ahras','Tipaza','Mila','Ain Defla','Naama','Ain Temouchent','Ghardaia','Relizane'],
  MA: ['Tanger-Tetouan-Al Hoceima','Oriental','Fes-Meknes','Rabat-Sale-Kenitra','Beni Mellal-Khenifra','Casablanca-Settat','Marrakech-Safi','Draa-Tafilalet','Souss-Massa','Guelmim-Oued Noun','Laayoune-Sakia El Hamra','Dakhla-Oued Ed-Dahab'],
  EG: ['Cairo','Alexandria','Giza','Qalyubia','Port Said','Suez','Luxor','Aswan','Asyut','Sohag','Qena','Red Sea','Beheira','Kafr El Sheikh','Gharbia','Monufia','Dakahlia','Damietta','Sharqia','Ismailia','Faiyum','Beni Suef','Minya','North Sinai','South Sinai','Matruh','New Valley'],
  LY: ['Tripoli','Benghazi','Misrata','Zawiya','Zintan','Sabha','Derna','Tobruk','Al Jabal Al Akhdar','Al Jabal Al Gharbi','Al Jufra','Al Kufra','Al Marj','Al Marqab','Al Wahat','Ghat','Murzuq','Nalut','Nuqat al Khams','Sirt','Wadi al Hayaa','Wadi al Shatii'],
  SD: ['Khartoum','Omdurman','Kassala','Port Sudan','Gedaref','El Obeid','Wad Madani','El Fasher','Nyala','Malakal'],
  ET: ['Addis Ababa','Afar','Amhara','Benishangul-Gumuz','Dire Dawa','Gambela','Harari','Oromia','Sidama','Somali','South Ethiopia','Southern Nations','Tigray'],
  KE: ['Nairobi','Mombasa','Kisumu','Nakuru','Eldoret','Kiambu','Machakos','Meru','Kakamega','Kilifi','Nyeri','Bungoma','Kisii','Migori','Siaya','Homa Bay','Turkana','Garissa','Mandera','Wajir','Marsabit','Isiolo','Tana River','Lamu','Taita-Taveta','Kwale','Kajiado','Narok','Bomet','Kericho','Nandi','Baringo','Laikipia','Samburu','Trans-Nzoia','West Pokot','Elgeyo-Marakwet','Uasin Gishu','Nyandarua','Kirinyaga','Muranga','Embu','Tharaka-Nithi','Kitui','Makueni','Vihiga','Busia'],
  NG: ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT Abuja','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara'],
  GH: ['Greater Accra','Ashanti','Western','Central','Eastern','Northern','Upper East','Upper West','Volta','Brong-Ahafo','Savannah','North East','Bono','Bono East','Ahafo','Western North','Oti'],
  ZA: ['Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','Northern Cape','North West','Western Cape'],
  TZ: ['Dar es Salaam','Dodoma','Mwanza','Arusha','Mbeya','Morogoro','Tanga','Zanzibar','Kagera','Kigoma','Kilimanjaro','Lindi','Mara','Mtwara','Pwani','Rukwa','Ruvuma','Shinyanga','Singida','Tabora'],
  SN: ['Dakar','Diourbel','Fatick','Kaffrine','Kaolack','Kedougou','Kolda','Louga','Matam','Saint-Louis','Sedhiou','Tambacounda','Thies','Ziguinchor'],
  SA: ['Riyadh','Makkah','Madinah','Eastern Province','Asir','Tabuk','Hail','Northern Borders','Jizan','Najran','Al Bahah','Al Jawf','Qassim'],
  AE: ['Abu Dhabi','Dubai','Sharjah','Ajman','Umm Al Quwain','Ras Al Khaimah','Fujairah'],
  IQ: ['Baghdad','Basra','Nineveh','Erbil','Sulaymaniyah','Duhok','Kirkuk','Anbar','Diyala','Saladin','Babil','Karbala','Najaf','Wasit','Maysan','Dhi Qar','Muthanna','Qadisiyyah'],
  SY: ['Damascus','Aleppo','Homs','Hama','Latakia','Deir ez-Zor','Idlib','Daraa','Raqqa','Hasakah','Tartus','Quneitra','As-Suwayda','Rif Dimashq'],
  JO: ['Amman','Zarqa','Irbid','Balqa','Mafraq','Jerash','Ajloun','Madaba','Karak','Tafilah','Maan','Aqaba'],
  LB: ['Beirut','Mount Lebanon','North Lebanon','South Lebanon','Bekaa','Nabatieh','Akkar','Baalbek-Hermel'],
  IL: ['Jerusalem','Tel Aviv','Haifa','Northern','Southern','Central'],
  OM: ['Muscat','Dhofar','Musandam','Al Buraymi','Ad Dakhiliyah','Al Batinah North','Al Batinah South','Ash Sharqiyah North','Ash Sharqiyah South','Al Wusta','Adh Dhahirah'],
  KW: ['Al Asimah','Hawalli','Farwaniyah','Ahmadi','Jahra','Mubarak Al-Kabeer'],
  QA: ['Doha','Al Rayyan','Al Wakrah','Al Khor','Al Shamal','Al Daayen','Umm Salal','Al Sheehaniya'],
  YE: ['Sanaa','Aden','Taiz','Al Hudaydah','Ibb','Dhamar','Hadramawt','Al Mahwit','Hajjah','Amran','Al Bayda','Lahij','Abyan','Shabwah','Marib','Al Jawf','Sadah','Socotra'],
  IR: ['Tehran','Isfahan','Fars','Khorasan Razavi','East Azerbaijan','West Azerbaijan','Khuzestan','Mazandaran','Gilan','Kerman','Alborz','Hamadan','Lorestan','Sistan and Baluchestan','Hormozgan','Golestan','Markazi','Ardabil','Zanjan','Semnan','Yazd','Bushehr','Chaharmahal and Bakhtiari','North Khorasan','South Khorasan','Kohgiluyeh and Boyer-Ahmad','Kurdistan','Kermanshah','Ilam','Qazvin','Qom'],
  TR: ['Istanbul','Ankara','Izmir','Bursa','Antalya','Adana','Konya','Gaziantep','Mersin','Kayseri','Eskisehir','Diyarbakir','Samsun','Denizli','Sanliurfa','Trabzon','Malatya','Erzurum','Van','Kahramanmaras'],
  IN: ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu and Kashmir','Ladakh'],
  PK: ['Punjab','Sindh','Khyber Pakhtunkhwa','Balochistan','Islamabad Capital Territory','Gilgit-Baltistan','Azad Kashmir'],
  BD: ['Dhaka','Chittagong','Rajshahi','Khulna','Barisal','Sylhet','Rangpur','Mymensingh'],
  CN: ['Anhui','Beijing','Chongqing','Fujian','Gansu','Guangdong','Guangxi','Guizhou','Hainan','Hebei','Heilongjiang','Henan','Hubei','Hunan','Inner Mongolia','Jiangsu','Jiangxi','Jilin','Liaoning','Ningxia','Qinghai','Shaanxi','Shandong','Shanghai','Shanxi','Sichuan','Tianjin','Tibet','Xinjiang','Yunnan','Zhejiang'],
  JP: ['Hokkaido','Aomori','Iwate','Miyagi','Akita','Yamagata','Fukushima','Ibaraki','Tochigi','Gunma','Saitama','Chiba','Tokyo','Kanagawa','Niigata','Toyama','Ishikawa','Fukui','Yamanashi','Nagano','Shizuoka','Aichi','Mie','Shiga','Kyoto','Osaka','Hyogo','Nara','Wakayama','Tottori','Shimane','Okayama','Hiroshima','Yamaguchi','Tokushima','Kagawa','Ehime','Kochi','Fukuoka','Saga','Nagasaki','Kumamoto','Oita','Miyazaki','Kagoshima','Okinawa'],
  KR: ['Seoul','Busan','Daegu','Incheon','Gwangju','Daejeon','Ulsan','Sejong','Gyeonggi','Gangwon','North Chungcheong','South Chungcheong','North Jeolla','South Jeolla','North Gyeongsang','South Gyeongsang','Jeju'],
  ID: ['Aceh','North Sumatra','West Sumatra','Riau','Jambi','South Sumatra','Bengkulu','Lampung','Bangka Belitung','Riau Islands','Jakarta','West Java','Central Java','Yogyakarta','East Java','Banten','Bali','West Nusa Tenggara','East Nusa Tenggara','West Kalimantan','Central Kalimantan','South Kalimantan','East Kalimantan','North Kalimantan','North Sulawesi','Central Sulawesi','South Sulawesi','Southeast Sulawesi','Gorontalo','West Sulawesi','Maluku','North Maluku','West Papua','Papua'],
  MY: ['Johor','Kedah','Kelantan','Kuala Lumpur','Labuan','Melaka','Negeri Sembilan','Pahang','Penang','Perak','Perlis','Putrajaya','Sabah','Sarawak','Selangor','Terengganu'],
  TH: ['Bangkok','Chiang Mai','Chiang Rai','Chonburi','Khon Kaen','Nakhon Ratchasima','Nonthaburi','Pathum Thani','Phuket','Samut Prakan','Songkhla','Surat Thani','Udon Thani','Ubon Ratchathani','Nakhon Si Thammarat'],
  VN: ['Hanoi','Ho Chi Minh City','Da Nang','Hai Phong','Can Tho','An Giang','Ba Ria-Vung Tau','Bac Giang','Bac Kan','Bac Lieu','Bac Ninh','Ben Tre','Binh Dinh','Binh Duong','Binh Phuoc','Binh Thuan','Ca Mau','Cao Bang','Dak Lak','Dak Nong','Dien Bien','Dong Nai','Dong Thap','Gia Lai','Ha Giang','Ha Nam','Ha Tinh','Hai Duong','Hau Giang','Hoa Binh','Hung Yen','Khanh Hoa','Kien Giang','Kon Tum','Lai Chau','Lam Dong','Lang Son','Lao Cai','Long An','Nam Dinh','Nghe An','Ninh Binh','Ninh Thuan','Phu Tho','Phu Yen','Quang Binh','Quang Nam','Quang Ngai','Quang Ninh','Quang Tri','Soc Trang','Son La','Tay Ninh','Thai Binh','Thai Nguyen','Thanh Hoa','Thua Thien Hue','Tien Giang','Tra Vinh','Tuyen Quang','Vinh Long','Vinh Phuc','Yen Bai'],
  PH: ['Metro Manila','Cebu','Davao','Iloilo','Laguna','Cavite','Bulacan','Pampanga','Batangas','Rizal','Negros Occidental','Pangasinan','Zamboanga del Sur','Leyte','Quezon','Isabela','Maguindanao','Bukidnon'],
  RU: ['Moscow','Saint Petersburg','Novosibirsk Oblast','Yekaterinburg Oblast','Nizhny Novgorod Oblast','Kazan','Chelyabinsk Oblast','Omsk Oblast','Samara Oblast','Rostov Oblast','Ufa','Krasnoyarsk Krai','Perm Krai','Voronezh Oblast','Volgograd Oblast','Krasnodar Krai','Saratov Oblast','Tyumen Oblast','Irkutsk Oblast','Primorsky Krai'],
  UA: ['Cherkasy','Chernihiv','Chernivtsi','Dnipropetrovsk','Donetsk','Ivano-Frankivsk','Kharkiv','Kherson','Khmelnytskyi','Kyiv','Kirovohrad','Luhansk','Lviv','Mykolaiv','Odessa','Poltava','Rivne','Sumy','Ternopil','Vinnytsia','Volyn','Zakarpattia','Zaporizhzhia','Zhytomyr'],
  KZ: ['Almaty','Nur-Sultan','Shymkent','Akmola','Aktobe','Almaty Region','Atyrau','East Kazakhstan','Jambyl','Karaganda','Kostanay','Kyzylorda','Mangystau','North Kazakhstan','Pavlodar','Turkestan','West Kazakhstan'],
  UZ: ['Tashkent','Andijan','Bukhara','Fergana','Jizzakh','Karakalpakstan','Kashkadarya','Khorezm','Namangan','Navoiy','Samarkand','Sirdaryo','Surkhandarya','Tashkent Region'],
  GE: ['Tbilisi','Adjara','Guria','Imereti','Kakheti','Kvemo Kartli','Mtskheta-Mtianeti','Racha-Lechkhumi','Samegrelo-Zemo Svaneti','Samtskhe-Javakheti','Shida Kartli'],
  AZ: ['Baku','Ganja','Sumqayit','Mingachevir','Nakhchivan','Lankaran','Shaki','Shirvan','Quba','Guba-Khachmaz'],
  AM: ['Yerevan','Aragatsotn','Ararat','Armavir','Gegharkunik','Kotayk','Lori','Shirak','Syunik','Tavush','Vayots Dzor'],
  BY: ['Minsk','Brest','Gomel','Grodno','Mogilev','Vitebsk'],
  FR: ['Ile-de-France','Auvergne-Rhone-Alpes','Hauts-de-France','Nouvelle-Aquitaine','Occitanie','Grand Est','Provence-Alpes-Cote d\'Azur','Pays de la Loire','Normandie','Bretagne','Bourgogne-Franche-Comte','Centre-Val de Loire','Corse'],
  DE: ['Bavaria','North Rhine-Westphalia','Baden-Wurttemberg','Lower Saxony','Hesse','Saxony','Rhineland-Palatinate','Berlin','Schleswig-Holstein','Brandenburg','Saxony-Anhalt','Thuringia','Hamburg','Mecklenburg-Vorpommern','Saarland','Bremen'],
  IT: ['Lombardy','Lazio','Campania','Sicily','Veneto','Emilia-Romagna','Piedmont','Apulia','Tuscany','Calabria','Sardinia','Liguria','Marche','Abruzzo','Friuli-Venezia Giulia','Trentino-Alto Adige','Umbria','Basilicata','Molise','Aosta Valley'],
  ES: ['Andalusia','Catalonia','Community of Madrid','Valencian Community','Galicia','Castile and Leon','Basque Country','Castilla-La Mancha','Canary Islands','Murcia','Aragon','Extremadura','Balearic Islands','Asturias','Navarre','Cantabria','La Rioja'],
  GB: ['England','Scotland','Wales','Northern Ireland'],
  PT: ['Aveiro','Beja','Braga','Braganca','Castelo Branco','Coimbra','Evora','Faro','Guarda','Leiria','Lisbon','Portalegre','Porto','Santarem','Setubal','Viana do Castelo','Vila Real','Viseu','Azores','Madeira'],
  GR: ['Attica','Central Greece','Central Macedonia','Crete','Eastern Macedonia and Thrace','Epirus','Ionian Islands','North Aegean','Peloponnese','South Aegean','Thessaly','Western Greece','Western Macedonia'],
  PL: ['Lower Silesian','Kuyavian-Pomeranian','Lublin','Lubusz','Lodz','Lesser Poland','Masovian','Opole','Subcarpathian','Podlaskie','Pomeranian','Silesian','Holy Cross','Warmian-Masurian','Greater Poland','West Pomeranian'],
  NL: ['Drenthe','Flevoland','Friesland','Gelderland','Groningen','Limburg','North Brabant','North Holland','Overijssel','South Holland','Utrecht','Zeeland'],
  BE: ['Antwerp','East Flanders','West Flanders','Flemish Brabant','Limburg','Hainaut','Liege','Luxembourg','Namur','Walloon Brabant','Brussels-Capital'],
  SE: ['Stockholm','Vastra Gotaland','Skane','Uppsala','Ostergotland','Jonkoping','Kronoberg','Kalmar','Gotland','Blekinge','Halland','Varmland','Orebro','Vastmanland','Dalarna','Gavleborg','Vasternorrland','Jamtland','Vasterbotten','Norrbotten','Sodermanland'],
  RO: ['Alba','Arad','Arges','Bacau','Bihor','Bistrita-Nasaud','Botosani','Braila','Brasov','Bucharest','Buzau','Calarasi','Caras-Severin','Cluj','Constanta','Covasna','Dambovita','Dolj','Galati','Giurgiu','Gorj','Harghita','Hunedoara','Ialomita','Iasi','Ilfov','Maramures','Mehedinti','Mures','Neamt','Olt','Prahova','Salaj','Satu Mare','Sibiu','Suceava','Teleorman','Timis','Tulcea','Valcea','Vaslui','Vrancea'],
  HU: ['Budapest','Baranya','Bacs-Kiskun','Bekes','Borsod-Abauj-Zemplen','Csongrad-Csanad','Fejer','Gyor-Moson-Sopron','Hajdu-Bihar','Heves','Jasz-Nagykun-Szolnok','Komarom-Esztergom','Nograd','Pest','Somogy','Szabolcs-Szatmar-Bereg','Tolna','Vas','Veszprem','Zala'],
  CZ: ['Prague','Central Bohemia','South Bohemia','Plzen','Karlovy Vary','Usti nad Labem','Liberec','Hradec Kralove','Pardubice','Vysocina','South Moravia','Olomouc','Zlin','Moravian-Silesian'],
  US: ['Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming'],
  CA: ['Ontario','Quebec','British Columbia','Alberta','Manitoba','Saskatchewan','Nova Scotia','New Brunswick','Newfoundland and Labrador','Prince Edward Island','Northwest Territories','Yukon','Nunavut'],
  AU: ['New South Wales','Victoria','Queensland','Western Australia','South Australia','Tasmania','Australian Capital Territory','Northern Territory'],
  MX: ['Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua','Coahuila','Colima','Durango','Guanajuato','Guerrero','Hidalgo','Jalisco','Mexico City','Mexico State','Michoacan','Morelos','Nayarit','Nuevo Leon','Oaxaca','Puebla','Queretaro','Quintana Roo','San Luis Potosi','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatan','Zacatecas'],
  BR: ['Acre','Alagoas','Amapa','Amazonas','Bahia','Ceara','Distrito Federal','Espirito Santo','Goias','Maranhao','Mato Grosso','Mato Grosso do Sul','Minas Gerais','Para','Paraiba','Parana','Pernambuco','Piaui','Rio de Janeiro','Rio Grande do Norte','Rio Grande do Sul','Rondonia','Roraima','Santa Catarina','Sao Paulo','Sergipe','Tocantins'],
  AR: ['Buenos Aires','Catamarca','Chaco','Chubut','Cordoba','Corrientes','Entre Rios','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones','Neuquen','Rio Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe','Santiago del Estero','Tierra del Fuego','Tucuman'],
  CO: ['Amazonas','Antioquia','Arauca','Atlantico','Bolivar','Boyaca','Caldas','Caqueta','Casanare','Cauca','Cesar','Choco','Cordoba','Cundinamarca','Guainia','Guaviare','Huila','La Guajira','Magdalena','Meta','Narino','Norte de Santander','Putumayo','Quindio','Risaralda','San Andres y Providencia','Santander','Sucre','Tolima','Valle del Cauca','Vaupes','Vichada','Bogota D.C.'],
  PE: ['Amazonas','Ancash','Apurimac','Arequipa','Ayacucho','Cajamarca','Callao','Cusco','Huancavelica','Huanuco','Ica','Junin','La Libertad','Lambayeque','Lima','Loreto','Madre de Dios','Moquegua','Pasco','Piura','Puno','San Martin','Tacna','Tumbes','Ucayali'],
  VE: ['Amazonas','Anzoategui','Apure','Aragua','Barinas','Bolivar','Carabobo','Cojedes','Delta Amacuro','Falcon','Guarico','Lara','Merida','Miranda','Monagas','Nueva Esparta','Portuguesa','Sucre','Tachira','Trujillo','Vargas','Yaracuy','Zulia','Caracas D.C.'],
  CL: ['Arica y Parinacota','Tarapaca','Antofagasta','Atacama','Coquimbo','Valparaiso','Metropolitan Region','OHiggins','Maule','Nuble','Biobio','La Araucania','Los Rios','Los Lagos','Aysen','Magallanes'],
  BO: ['Beni','Chuquisaca','Cochabamba','La Paz','Oruro','Pando','Potosi','Santa Cruz','Tarija'],
  AF: ['Kabul','Kandahar','Herat','Balkh','Nangarhar','Kunduz','Ghazni','Badakhshan','Takhar','Baghlan','Helmand','Logar','Wardak','Parwan'],
  AL: ['Berat','Diber','Durres','Elbasan','Fier','Gjirokaster','Korce','Kukes','Lezhe','Shkoder','Tirana','Vlore'],
};

async function main() {
  console.log('Seeding governorates...');
  let total = 0;

  for (const [isoCode, govNames] of Object.entries(GOVERNORATES)) {
    const country = await prisma.country.findUnique({ where: { isoCode } });
    if (!country) {
      console.warn(`  Country not found: ${isoCode}, skipping`);
      continue;
    }

    for (const name of govNames) {
      const existing = await prisma.governorate.findFirst({
        where: { countryId: country.id, nameGovernorate: name },
      });
      if (!existing) {
        await prisma.governorate.create({
          data: { nameGovernorate: name, countryId: country.id },
        });
        total++;
      }
    }
    console.log(`  ${isoCode}: ${govNames.length} governorates`);
  }

  console.log(`Done. Inserted ${total} new governorates.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
