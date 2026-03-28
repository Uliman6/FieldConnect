// Bakım (Maintenance) Form Definitions
// Based on official ARI Yangın templates:
// - Dizel Pompa Periyodik Kontrol ve Bakım Formu_rev02.pdf
// - Elektrikli Pompa Periyodik Kontrol ve Bakım Formu_rev03.pdf

export type FieldType = 'YES_NO' | 'YES_NO_NA' | 'TEXT' | 'NUMBER' | 'DATE' | 'TEXTAREA' | 'CHECKBOX' | 'SIGNATURE';

export interface FormField {
  id: string;
  label: string;
  labelEn?: string;
  type: FieldType;
  unit?: string;
  required?: boolean;
  placeholder?: string;
}

export interface FormSection {
  id: string;
  title: string;
  titleEn?: string;
  description?: string;
  fields: FormField[];
  // Which pump types this section applies to
  applicableTo?: ('ELEKTRIKLI' | 'DIZEL' | 'ALL')[];
}

// ============================================
// MEASURING INSTRUMENTS - Ölçüm Aletleri Bilgileri
// ============================================
export const measuringInstrumentsSection: FormSection = {
  id: 'measuring_instruments',
  title: '3. Ölçüm Aletleri Bilgileri',
  titleEn: 'Measuring Instruments Information',
  fields: [
    { id: 'instrument1_name', label: 'Ölçüm Aleti Adı', labelEn: 'Instrument 1 Name', type: 'TEXT' },
    { id: 'instrument1_serial', label: 'Ölçüm Aleti Seri No', labelEn: 'Instrument 1 Serial No', type: 'TEXT' },
    { id: 'instrument2_name', label: 'Ölçüm Aleti Adı', labelEn: 'Instrument 2 Name', type: 'TEXT' },
    { id: 'instrument2_serial', label: 'Ölçüm Aleti Seri No', labelEn: 'Instrument 2 Serial No', type: 'TEXT' },
    { id: 'instrument3_name', label: 'Ölçüm Aleti Adı', labelEn: 'Instrument 3 Name', type: 'TEXT' },
    { id: 'instrument3_serial', label: 'Ölçüm Aleti Seri No', labelEn: 'Instrument 3 Serial No', type: 'TEXT' },
  ],
  applicableTo: ['ALL'],
};

// ============================================
// PUMP PERFORMANCE - DIESEL - Pompa Performans Ölçümü (Dizel)
// ============================================
export const pumpPerformanceDieselSection: FormSection = {
  id: 'pump_performance_diesel',
  title: '3.1 Pompa Performans Ölçümü/GPM',
  titleEn: 'Pump Performance Measurement/GPM',
  fields: [
    // Flow rates
    { id: 'flow_0_percent', label: '0% Akış / No Flow', labelEn: '0% Flow', type: 'NUMBER', unit: 'GPM' },
    { id: 'flow_100_percent', label: '100% Anma Akış / Rated Flow', labelEn: '100% Rated Flow', type: 'NUMBER', unit: 'GPM' },
    { id: 'flow_150_percent', label: '150% Akış / Peak Flow', labelEn: '150% Peak Flow', type: 'NUMBER', unit: 'GPM' },
    // Coolant pressure (DIESEL ONLY)
    { id: 'coolant_pressure_0', label: 'Soğutma suyu basıncı / coolant pressure 0%', labelEn: 'Coolant pressure 0%', type: 'NUMBER', unit: 'PSI' },
    { id: 'coolant_pressure_100', label: 'Soğutma suyu basıncı / coolant pressure 100%', labelEn: 'Coolant pressure 100%', type: 'NUMBER', unit: 'PSI' },
    { id: 'coolant_pressure_150', label: 'Soğutma suyu basıncı / coolant pressure 150%', labelEn: 'Coolant pressure 150%', type: 'NUMBER', unit: 'PSI' },
    // Suction pressure
    { id: 'suction_pressure_0', label: 'Emiş basıncı / suction pressure %0', labelEn: 'Suction pressure 0%', type: 'NUMBER', unit: 'PSI' },
    { id: 'suction_pressure_100', label: 'Emiş basıncı / suction pressure %100', labelEn: 'Suction pressure 100%', type: 'NUMBER', unit: 'PSI' },
    { id: 'suction_pressure_150', label: 'Emiş basıncı / suction pressure %150', labelEn: 'Suction pressure 150%', type: 'NUMBER', unit: 'PSI' },
    // RPM
    { id: 'rpm_0', label: 'Devir / RPM 0%', labelEn: 'RPM 0%', type: 'NUMBER', unit: 'RPM' },
    { id: 'rpm_100', label: 'Devir / RPM 100%', labelEn: 'RPM 100%', type: 'NUMBER', unit: 'RPM' },
    { id: 'rpm_150', label: 'Devir / RPM 150%', labelEn: 'RPM 150%', type: 'NUMBER', unit: 'RPM' },
  ],
  applicableTo: ['DIZEL'],
};

// ============================================
// PUMP PERFORMANCE - ELECTRIC - Pompa Performans Ölçümü (Elektrikli)
// Includes Amper/Voltaj readings at 0%, 100%, 150%
// ============================================
export const pumpPerformanceElectricSection: FormSection = {
  id: 'pump_performance_electric',
  title: '3.1 Pompa Performans Ölçümü/GPM',
  titleEn: 'Pump Performance Measurement/GPM',
  fields: [
    // Flow rates
    { id: 'flow_0_percent', label: '0% Akış / No Flow', labelEn: '0% Flow', type: 'NUMBER', unit: 'GPM' },
    { id: 'flow_100_percent', label: '100% Anma Akış / Rated Flow', labelEn: '100% Rated Flow', type: 'NUMBER', unit: 'GPM' },
    { id: 'flow_150_percent', label: '150% Akış / Peak Flow', labelEn: '150% Peak Flow', type: 'NUMBER', unit: 'GPM' },
    // Amper/Voltaj (ELECTRIC ONLY - in performance section per template)
    { id: 'ampere_voltage_0', label: 'Amper/Ampere - Voltaj/Voltage 0%', labelEn: 'Ampere/Voltage 0%', type: 'TEXT', placeholder: 'örn: 45A / 380V' },
    { id: 'ampere_voltage_100', label: 'Amper/Ampere - Voltaj/Voltage 100%', labelEn: 'Ampere/Voltage 100%', type: 'TEXT', placeholder: 'örn: 85A / 378V' },
    { id: 'ampere_voltage_150', label: 'Amper/Ampere - Voltaj/Voltage 150%', labelEn: 'Ampere/Voltage 150%', type: 'TEXT', placeholder: 'örn: 120A / 375V' },
    // Suction pressure
    { id: 'suction_pressure_0', label: 'Emiş basıncı / suction pressure %0', labelEn: 'Suction pressure 0%', type: 'NUMBER', unit: 'PSI' },
    { id: 'suction_pressure_100', label: 'Emiş basıncı / suction pressure %100', labelEn: 'Suction pressure 100%', type: 'NUMBER', unit: 'PSI' },
    { id: 'suction_pressure_150', label: 'Emiş basıncı / suction pressure %150', labelEn: 'Suction pressure 150%', type: 'NUMBER', unit: 'PSI' },
    // RPM
    { id: 'rpm_0', label: 'Devir / RPM 0%', labelEn: 'RPM 0%', type: 'NUMBER', unit: 'RPM' },
    { id: 'rpm_100', label: 'Devir / RPM 100%', labelEn: 'RPM 100%', type: 'NUMBER', unit: 'RPM' },
    { id: 'rpm_150', label: 'Devir / RPM 150%', labelEn: 'RPM 150%', type: 'NUMBER', unit: 'RPM' },
  ],
  applicableTo: ['ELEKTRIKLI'],
};

// ============================================
// CONTROL CRITERIA - DIESEL
// ============================================
export const controlCriteriaDieselSection: FormSection = {
  id: 'control_criteria_diesel',
  title: '4. Periyodik Bakım Kontrol Kriterleri ve Testler',
  titleEn: 'Periodic Maintenance Control Criteria and Tests',
  fields: [
    { id: 'nfpa_20', label: 'NFPA 20', type: 'CHECKBOX' },
    { id: 'nfpa_25', label: 'NFPA 25', type: 'CHECKBOX' },
    { id: 'ts_en_12845', label: 'TS EN 12845', type: 'CHECKBOX' },
    { id: 'nfpa_13', label: 'NFPA 13', type: 'CHECKBOX' },
  ],
  applicableTo: ['DIZEL'],
};

// ============================================
// CONTROL CRITERIA - ELECTRIC
// ============================================
export const controlCriteriaElectricSection: FormSection = {
  id: 'control_criteria_electric',
  title: '4. Periyodik Bakım Kontrol Kriterleri ve Testler',
  titleEn: 'Periodic Maintenance Control Criteria and Tests',
  fields: [
    { id: 'nfpa_20', label: 'NFPA 20', type: 'CHECKBOX' },
    { id: 'nfpa_25', label: 'NFPA 25', type: 'CHECKBOX' },
    { id: 'ts_en_12845', label: 'TS EN 12845', type: 'CHECKBOX' },
    { id: 'turkiye_yangin_yonetmeligi', label: 'Türkiye Yangın Yönetmeliği', type: 'CHECKBOX' },
  ],
  applicableTo: ['ELEKTRIKLI'],
};

// ============================================
// GENERAL TEST/MAINTENANCE - Genel Test/Bakım (Both Electric & Diesel)
// ============================================
export const generalMaintenanceSection: FormSection = {
  id: 'general_maintenance',
  title: 'Test / Bakım - Genel',
  titleEn: 'Test / Maintenance - General',
  fields: [
    { id: 'pumps_automatic', label: 'Yangın pompaları otomatik konumda mı? / Were the fire pumps in automatic position?', type: 'YES_NO' },
    { id: 'controllers_open', label: 'Son bakımdan itibaren kontrol panelleri açık mıydı? / Were the controllers open since the last maintenance?', type: 'YES_NO' },
    { id: 'room_temp_ok', label: 'Pompa odasındaki ısı 40°F/5°C veya daha yüksek / Heat in pump room is 40°F/5°C or higher', type: 'YES_NO' },
    { id: 'ventilation_ok', label: 'Pompa odasındaki hava giriş panjurları çalışır durumda görünüyor / Intake air louvers in pump room appear operational', type: 'YES_NO' },
    { id: 'valves_open', label: 'Pompa emme, basma ve baypas valfleri açık / Pump suction, discharge, and bypass valves are open', type: 'YES_NO' },
    { id: 'reservoir_full', label: 'Su deposu dolu / Suction reservoir is full', type: 'YES_NO' },
    { id: 'no_leaks', label: 'Boru veya hortum sızıntısı yok / No piping or hoses leak', type: 'YES_NO' },
    { id: 'weekly_run_schedule', label: 'Pompalar ayda akışsız elektrikli pompalar 10 dakika, dizeller 30 dakika çalıştırılıyor mu? / Pumps no flow electric pumps 10 minutes per month, diesels run 30 minutes a week?', type: 'YES_NO' },
    { id: 'pressures_acceptable', label: 'Yukarıdaki basınç ve değerler kabul edilir mi? / Are the above pressures and values acceptable?', type: 'YES_NO' },
  ],
  applicableTo: ['ALL'],
};

// ============================================
// DIESEL PUMP - 1. Dizel Pompa (Page 1)
// ============================================
export const dieselPumpSection1: FormSection = {
  id: 'diesel_pump_1',
  title: '1- Dizel Pompa / Diesel Pump',
  titleEn: 'Diesel Pump',
  fields: [
    { id: 'controller_on', label: 'Kontrol Paneli "on" pozisyonunda / Controller is "on" position', type: 'YES_NO' },
    { id: 'waterflow_valves_closed', label: 'Su akışı test vanaları kapalı konumda (flowmeter) / Waterflow test valves are in the closed position', type: 'YES_NO' },
    { id: 'pilot_light_on', label: 'Kontrol paneli pilot ışığı (güç açık) yanıyor / Controller pilot light (power on) is illuminated', type: 'YES_NO' },
    { id: 'bearings_lubricated', label: 'Pompa yatakları yağlandı mı? / Are the pump bearings lubricated?', type: 'YES_NO' },
    { id: 'no_vibration', label: 'Pompa çalıştığında vibrayon yok / There is no vibration when the pump is running', type: 'YES_NO' },
    { id: 'operating_time_hours', label: 'Pompanın çalışma süresi (Saat) / Operating time of the pump (Hours)', type: 'NUMBER', unit: 'Saat/Hours' },
    { id: 'pressure_calibration_done', label: 'Pompa basınç kalibrasyonları yapıldı mı? Kontrol yapıldı mı? / Have pump pressure calibrations been done?', type: 'YES_NO' },
    { id: 'start_pressure', label: 'Pompa start basıncı / Pump start pressure', type: 'NUMBER', unit: 'PSI' },
    { id: 'stop_pressure', label: 'Pompa stop basıncı / Pump stop pressure', type: 'NUMBER', unit: 'PSI' },
    { id: 'manual_stop_set', label: 'Pompa Manual stop ayarlı / The pump is set to Manual stop', type: 'YES_NO' },
    { id: 'auto_stop_time', label: 'Pompa otomatik stop ediyor (dakika sonra) / The pump stops automatically after (minutes)', type: 'NUMBER', unit: 'dk/min' },
    { id: 'started_from_sensing_line', label: 'Pompa hissetme hattından start verildi mi? / Has the pump been started from the sensing line?', type: 'YES_NO' },
    { id: 'cable_tightness_checked', label: 'Kabloların sıkılığını kontrol edin / Check the tightness of the cables', type: 'YES_NO' },
    { id: 'manual_start_given', label: 'Pompalara manual start verildi mi? / Have the pumps been started manually?', type: 'YES_NO' },
    { id: 'alarm_lights_off', label: 'Tüm alarm ışıkları "kapalı" / All alarm pilot lights are "off"', type: 'YES_NO' },
    { id: 'pump_sound_ok', label: 'Pompanın sesi uygun mu? / Is the sound of the pump okay?', type: 'YES_NO' },
    { id: 'diesel_driver_listed', label: 'Dizel driver, pompa ve kaplin listeli mi?', type: 'YES_NO' },
    { id: 'no_corrosion', label: 'Herhangi bir devre kartında korozyon yok / No corrosion on any circuit board', type: 'YES_NO' },
  ],
  applicableTo: ['DIZEL'],
};

// ============================================
// DIESEL PUMP CONTINUATION - Dizel Pompa Devamı (Page 2)
// ============================================
export const dieselPumpSection2: FormSection = {
  id: 'diesel_pump_2',
  title: 'Dizel Pompa Devamı / Diesel Pump Continuation',
  titleEn: 'Diesel Pump Continuation',
  fields: [
    { id: 'packing_glands_adjusted', label: 'Salmastra sıkma aparatları düzgün ayarlanmış görünüyor / Packing glands appear properly adjusted', type: 'YES_NO' },
    { id: 'manual_start_from_controller', label: 'Pompaya denetleyiciden manual start verildi / The pump has been manually started from the controller', type: 'YES_NO' },
    { id: 'shaft_coupling_aligned', label: 'Yangın pompası şaft kaplini düzgün şekilde hizalanmış görünüyor / Fire pump shaft coupling appears properly aligned', type: 'YES_NO' },
    { id: 'packings_drip_normal', label: 'Salmastraların damlatmaları normal / It is normal for the packings to drip', type: 'YES_NO' },
    { id: 'no_overheating', label: 'Ambalaj kutuları, yataklar ve pompa gövdesinde aşırı ısınma yoktur / Packing boxes, bearings, and pump casing are free of overheating', type: 'YES_NO' },
    { id: 'current_draw_normal', label: 'Pompanın start almasıyla, çektiği akım normal mi? / With the start of the pump, is the current drawn normal?', type: 'YES_NO' },
    { id: 'fuel_tank_level', label: 'Dizel yakıt deposu en az 2/3 dolu / Diesel fuel tank is at least 2/3 full', type: 'YES_NO' },
    { id: 'controller_auto_position', label: 'Kontrol paneli seçici anahtarı "otomatik" konumunda / Controller selector switch is in "auto" position', type: 'YES_NO' },
    { id: 'battery_voltage_normal', label: '2 akü için voltaj okumaları normaldir / Voltage readings for batteries (2) are normal', type: 'YES_NO' },
    { id: 'battery_charging_normal', label: 'Aküler için şarj akımı okumaları normaldir / Charging current readings are normal for batteries', type: 'YES_NO' },
    { id: 'starts_since_last_maintenance', label: 'Son bakımdan bu yana pompanın start alma sayısı / Number of starts since last maintenance', type: 'NUMBER', unit: 'adet' },
    { id: 'time_to_full_speed', label: 'Motorun tam hıza çıkması için geçen süre / Time for motor to accelerate to full speed', type: 'NUMBER', unit: 'sn/sec' },
    { id: 'solenoid_valve_ok', label: 'Solenoid valf düzgün çalışıyor / Solenoid valve is operating correctly', type: 'YES_NO' },
    { id: 'total_operating_hours', label: 'Pompanın toplam çalışma süresi (Saat) / Total operating time (Hours)', type: 'NUMBER', unit: 'Saat/Hours' },
    { id: 'weekly_runs_done', label: 'Son Bakımdan bu yana, pompalar haftalık çalıştırılmış / Since the last Maintenance, the pumps have been run weekly', type: 'YES_NO' },
    { id: 'cooling_strainers_blown', label: 'Birincil ve ikincil soğutma hattı süzgeçlerini blöfleyin / Blow down primary and secondary cooling line strainers', type: 'YES_NO' },
    { id: 'coolant_solenoid_clean', label: 'Soğutma suyu selenoid valf pislik tutucu temiz mi? / Is the coolant solenoid valve strainer clean?', type: 'YES_NO' },
    { id: 'battery_pilot_lights_ok', label: 'Aküler için pilot ışıklar yanıyor veya pil arızası pilotu ışıklar "kapalı" / Pilot lights for batteries are on or battery failure pilot lights are "off"', type: 'YES_NO' },
    { id: 'crankcase_oil_normal', label: 'Karter yağ seviyesi uygun mu? / Crankcase oil level is normal?', type: 'YES_NO' },
    { id: 'antifreeze_level_normal', label: 'Antifriz seviyesi uygun / Cooling water level is normal', type: 'YES_NO' },
    { id: 'battery_electrolyte_normal', label: 'Akü su seviyesi uygun / Electrolyte level in batteries is normal', type: 'YES_NO' },
    { id: 'battery_terminals_no_corrosion', label: 'Akü kutup başlarında korozyon yok / Battery terminals are free of corrosion', type: 'YES_NO' },
    { id: 'water_jacket_heater_ok', label: 'Isıtıcı çalışır durumda / Water-jacket heater is operational', type: 'YES_NO' },
    { id: 'exhaust_no_leak', label: 'Egzoz hattında gaz sızıntısı yok / There is no gas leak in the exhaust line', type: 'YES_NO' },
    { id: 'aftercooler_drained', label: 'Aftercooler da yoğuşan su varsa boşaltın / Drain condensate trap of cooling system', type: 'YES_NO' },
    { id: 'diesel_tank_water_checked', label: 'Dizel yakıt deposunda su olup olmadığını kontrol edin / Check for water in diesel fuel tank', type: 'YES_NO' },
    { id: 'cooling_strainer_cleaned', label: 'Dizel yangın pompası için soğutma sisteminde temiz su süzgeci temizledin mi? / Clean water strainer in cooling system', type: 'YES_NO' },
    { id: 'filters_changed', label: 'Motor yağı, yağ filtresi, yakıt filtresi, antifriz ve hava filtresi yenisi ile değişti mi? / Has the engine oil, oil filter, fuel filter, antifreeze and air filter been changed?', type: 'YES_NO' },
    { id: 'coolant_pressure_noted', label: 'Soğutma suyundan geçen su basıncını not edin / Note the water pressure through the coolant', type: 'YES_NO' },
    { id: 'electrical_wiring_checked', label: 'Harekete maruz kalan yerlerde elektrik kablolarında sürtünme olup olmadığını kontrol edin / Check electrical wiring for chafing', type: 'YES_NO' },
    { id: 'filters_oils_changed_yearly', label: 'Tüm Filtreler ve yağlar her 50 saatte bir mi yoksa yılda bir mi değiştirildi? / Have all Filters and oils been changed every 50 hours or once a year?', type: 'YES_NO' },
    { id: 'engine_crank_time', label: 'Dizel motorun marş basma süresini kaydedin / Record time for diesel engine to crank', type: 'NUMBER', unit: 'sn/sec' },
    { id: 'bypass_valves_pressure_rise', label: 'Soğutma suyundaki bypass valfleri açıldığında basınç yükseliyor / Does the pressure rise when the bypass valves open?', type: 'YES_NO' },
    { id: 'pump_rpm_recorded', label: 'Pompa hızını rpm cinsinden kaydedin / Record the pump speed in rpm', type: 'NUMBER', unit: 'RPM' },
    { id: 'rv_not_operating_during_test', label: 'Akış testi sırasında pompa RV nin çalışmadığını doğrulayın / Verify that the pump RV is not operating during the flow test', type: 'YES_NO' },
    { id: 'alarm_circuits_simulated', label: 'Alarm sensörü konumlarındaki alarm devrelerini etkinleştirerek pompa ve sürücü alarm koşullarını simüle edin / Simulate pump and driver alarm conditions', type: 'YES_NO' },
    { id: 'performance_curve_compared', label: 'Pompa performans eğrisi çizilecek ve pompanın orijinal test eğrisiyle karşılaştırılacak / Pump performance curve compared to original', type: 'YES_NO' },
    { id: 'ecm_test_done', label: 'Dizel sürücüler için elektronik kontrol modüllerini (ECM) test edin / For diesel drivers test ECM', type: 'YES_NO_NA' },
    { id: 'pressure_relief_valves_tested', label: 'Basınç tahliye ve vakum kontrol vanaları - Yıllık Kontrol / Pressure-relieving and suction-control valves Annual Test', type: 'YES_NO' },
    { id: 'circulation_relief_valve_checked', label: 'Sirkülasyon tahliye vanasının çalışıp çalışmadığını kontrol edin / Inspect the circulation relief valve for operation', type: 'YES_NO_NA' },
  ],
  applicableTo: ['DIZEL'],
};

// ============================================
// TURBINE TYPE PUMP - Turbin Tip Pompa
// ============================================
export const turbinePumpSection: FormSection = {
  id: 'turbine_pump',
  title: 'Turbin Tip Pompa / Turbine Type Pump',
  titleEn: 'Turbine Type Pump',
  fields: [
    { id: 'turbine_oil_level', label: 'Türbine yağ seviyesi uygun / Turbine oil level is appropriate', type: 'YES_NO_NA' },
    { id: 'air_vent_valve_ok', label: 'Hava atma ventili uygun çalışıyor / Air vent valve is working properly', type: 'YES_NO_NA' },
    { id: 'pump_fixings_suitable', label: 'Türbine pompa sabitlemeleri uygun / Suitable for pump fixings to the turbine', type: 'YES_NO_NA' },
    { id: 'turbine_reducer_tight', label: 'Türbine redüktör civataları uygun sıkılıkta / Turbine reducer bolts properly tightened', type: 'YES_NO_NA' },
    { id: 'packing_dripping', label: 'Salmastra damlatma saniyede bir / Packing dripping every second', type: 'YES_NO_NA' },
    { id: 'reducer_nut_size_measured', label: 'Redüktör kilitleme somunu ölçüsünü kumpas ile ölçün / Measure the reducer locking nut size with a caliper', type: 'YES_NO_NA' },
    { id: 'pumps_drivers_listed', label: 'Pompalar, driverlar UL,FM,VDS Listeli mi?', type: 'YES_NO_NA' },
  ],
  applicableTo: ['ALL'],
};

// ============================================
// ELECTRIC PUMP - 1. Elektrikli Pompa (Page 1)
// ============================================
export const electricPumpSection1: FormSection = {
  id: 'electric_pump_1',
  title: '1- Elektrikli Pompa / Electric Pump',
  titleEn: 'Electric Pump',
  fields: [
    { id: 'controller_on', label: '1- Kontrol Paneli "on" pozisyonunda / Controller is "on" position', type: 'YES_NO' },
    { id: 'waterflow_valves_closed', label: '1.1- Su akışı test vanaları kapalı konumda (flowmeter) / Waterflow test valves are in the closed position', type: 'YES_NO' },
    { id: 'pilot_light_on', label: '1.2- Kontrol paneli pilot ışığı (güç açık) yanıyor / Controller pilot light (power on) is illuminated', type: 'YES_NO' },
    { id: 'transfer_switch_light_on', label: '1.3- Transfer anahtarı normal güç ışığı yanıyor / Transfer switch normal power light is illuminated', type: 'YES_NO' },
    { id: 'reverse_phase_alarm_off', label: '1.4- Tek faz alarm ışığı yanmıyor / Reverse-phase alarm light is not illuminated', type: 'YES_NO' },
    { id: 'ats_no_energy', label: '1.5- Ats Tarafında enerji yok (jeneratör durur) / There is no energy on the ats side (generator stops)', type: 'YES_NO' },
    { id: 'start_pressure', label: 'Pompa start basıncı / Pump start pressure', type: 'NUMBER', unit: 'PSI' },
    { id: 'stop_pressure', label: 'Pompa stop basıncı / Pump stop pressure', type: 'NUMBER', unit: 'PSI' },
    { id: 'auto_stop_time', label: 'Pompa otomatik stop ediyor (Dakika sonra) / The pump stops automatically after (minutes)', type: 'NUMBER', unit: 'dk/min' },
    { id: 'manual_stop_set', label: 'Pompa Manual stop ayarlı / The pump is set to Manual stop', type: 'YES_NO' },
    { id: 'ats_generator_test', label: 'Ats Jeneratör start testi yapıldı / Ats Generator start test was performed', type: 'YES_NO' },
    { id: 'voltmeter_ammeter_accuracy', label: 'Voltmetreyi ve ampermetreyi doğruluk açısından kontrol edin (%5) / Check voltmeter and ammeter for accuracy (5%)', type: 'YES_NO' },
    { id: 'cable_tightness_checked', label: 'Kabloların sıkılığını kontrol edin / Check the tightness of the cables', type: 'YES_NO' },
    { id: 'pump_panel_fixings', label: 'Pompa ve panel Sabitlemeleri uygun mu? / Are Pump and Panel fixings suitable?', type: 'YES_NO' },
    { id: 'casing_relief_valve', label: 'Casing relief valf çalışıyor / Casing relief valve is working', type: 'YES_NO' },
    { id: 'reverse_phase_pilot_off', label: 'Ters faz pilot ışığı "kapalı" / Reverse-phase pilot light is "off"', type: 'YES_NO' },
    { id: 'no_corrosion', label: 'Herhangi bir devre kartında korozyon yok / No corrosion on any circuit board', type: 'YES_NO' },
  ],
  applicableTo: ['ELEKTRIKLI'],
};

// ============================================
// ELECTRIC PUMP CONTINUATION - Elektrikli Pompa Devamı (Page 2)
// ============================================
export const electricPumpSection2: FormSection = {
  id: 'electric_pump_2',
  title: 'Elektrikli Pompa Devamı / Electric Pump Continuation',
  titleEn: 'Electric Pump Continuation',
  fields: [
    { id: 'normal_phase_rotation_on', label: 'Normal faz dönüş pilot ışığı "açık" / Normal-phase rotation pilot light is "on"', type: 'YES_NO' },
    { id: 'shaft_coupling_aligned', label: 'Yangın pompası şaft kaplini düzgün şekilde hizalanmış görünüyor / Fire pump shaft coupling appears properly aligned', type: 'YES_NO' },
    { id: 'packing_glands_adjusted', label: 'Salmastra sıkma aparatları düzgün ayarlanmış görünüyor / Packing glands appear properly adjusted', type: 'YES_NO' },
    { id: 'packings_drip_normal', label: 'Salmastraların damlatmaları normal / It is normal for the packings to drip', type: 'YES_NO' },
    { id: 'no_vibration', label: 'Pompa çalıştığında vibrayon yok / There is no vibration when the pump is running', type: 'YES_NO' },
    { id: 'bearings_lubricated', label: 'Pompa yatakları yağlandı mı? / Are the pump bearings lubricated?', type: 'YES_NO' },
    { id: 'operating_time_hours', label: 'Pompanın çalışma süresi (Saat) / Operating time of the pump (Hours)', type: 'NUMBER', unit: 'Saat/Hours' },
    { id: 'weekly_runs_done', label: 'Son Bakımdan bu yana, pompalar haftalık çalıştırılmış / Since the last Maintenance, the pumps have been run weekly', type: 'YES_NO' },
    { id: 'starts_since_last_maintenance', label: 'Son bakımdan bu yana pompanın start alma sayısı / Number of starts since last maintenance', type: 'NUMBER', unit: 'adet' },
    { id: 'started_from_sensing_line', label: 'Pompa hissetme hattından start verildi mi? / Has the pump been started from the sensing line?', type: 'YES_NO' },
    { id: 'pump_sound_ok', label: 'Pompanın sesi uygun mu? / Is the sound of the pump okay?', type: 'YES_NO' },
    { id: 'current_draw_normal', label: 'Pompanın start almasıyla, çektiği akım normal mi? / With the start of the pump, is the current drawn normal?', type: 'YES_NO' },
    { id: 'no_overheating', label: 'Ambalaj kutuları, yataklar ve pompa gövdesinde aşırı ısınma yoktur / Packing boxes, bearings, and pump casing are free of overheating', type: 'YES_NO' },
    { id: 'pressure_calibration_done', label: 'Pompa basınç kalibrasyonları yapıldı mı? Kontrol yapıldı mı? / Have pump pressure calibrations been done?', type: 'YES_NO' },
    { id: 'manual_start_from_controller', label: 'Pompaya denetleyiciden manual start verildi / The pump has been manually started from the controller', type: 'YES_NO' },
    { id: 'rotation_direction_correct', label: 'Pompanın dönüş yönü doğru / The direction of rotation of the pump is correct', type: 'YES_NO' },
    { id: 'sensing_line_solenoid', label: 'Hissetme hattındaki selenoid çalışıyor / The solenoid in the sensing line is working', type: 'YES_NO' },
    // Right column - additional checks
    { id: 'fire_water_tank_level', label: 'Yangın suyu deposu seviyesi kontrol edilir / The fire water tank level is checked', type: 'YES_NO' },
    { id: 'fire_boosters_cleaned', label: 'Yangın hidroforlarının fiziksel temizliği yapıldı mı? / Have fire boosters been physically cleaned?', type: 'YES_NO' },
    { id: 'booster_valves_open', label: 'Yangın hidroforlarının emiş ve basma tarafındaki vanaların açık olduğu kontrol edilir / Check valves on suction and discharge sides are open', type: 'YES_NO' },
    { id: 'suction_filter_cleaned', label: 'Emiş kollektörü filtresi (varsa) temizlenir / The suction collector filter (if any) is cleaned', type: 'YES_NO' },
  ],
  applicableTo: ['ELEKTRIKLI'],
};

// ============================================
// ELECTRIC PUMP 2 - 2. Pompa (for systems with 2 electric pumps)
// ============================================
export const electricPump2Section: FormSection = {
  id: 'electric_pump_2nd',
  title: '2. Pompa / 2nd Pump',
  titleEn: '2nd Pump',
  description: 'İkinci elektrikli pompa için (varsa) / For second electric pump (if applicable)',
  fields: [
    { id: 'pump2_start_pressure', label: '2. Pompa start basıncı / 2nd Pump start pressure', type: 'NUMBER', unit: 'PSI' },
    { id: 'pump2_stop_pressure', label: '2. Pompa stop basıncı / 2nd Pump stop pressure', type: 'NUMBER', unit: 'PSI' },
    { id: 'pump2_auto_stop_time', label: '2. Pompa otomatik stop ediyor (Dakika sonra) / 2nd pump stops automatically after (minutes)', type: 'NUMBER', unit: 'dk/min' },
    { id: 'pump2_manual_stop_set', label: '2. Pompa Manual stop ayarlı / 2nd pump is set to Manual stop', type: 'YES_NO' },
  ],
  applicableTo: ['ELEKTRIKLI'],
};

// ============================================
// JOCKEY PUMP - Jockey Pompa (SEPARATE - for jockey pumps only)
// ============================================
export const jockeyPumpSection: FormSection = {
  id: 'jockey_pump',
  title: 'Jokey Pompa / Jockey Pump',
  titleEn: 'Jockey Pump',
  fields: [
    { id: 'jockey_switch_on', label: 'Jokey pompa şalteri açık mı? / Is the jockey pump switch on?', type: 'YES_NO' },
    { id: 'jockey_manual_working', label: 'Jokey pompa manual çalışıyor mu? / Does the jockey pump start manual?', type: 'YES_NO' },
    { id: 'jockey_start_pressure', label: 'Jokey pompa start basıncı / Jockey pump start pressure', type: 'NUMBER', unit: 'PSI' },
    { id: 'jockey_stop_pressure', label: 'Jokey pompa stop basıncı / Jockey pump stop pressure', type: 'NUMBER', unit: 'PSI' },
    { id: 'jockey_pressure_calibration_normal', label: 'Jokey pompa basınç kalibrasyonu normal mi? / Jockey pump pressure calibration normal?', type: 'YES_NO' },
    { id: 'jockey_controller_auto', label: 'Jokey pompası kontrolörü "otomatik" olarak ayarlanmıştır / Jockey pump controller is set on "auto"', type: 'YES_NO' },
    { id: 'jockey_rotation_correct', label: 'Jokey pompa dönüş yönü doğru mu? / Is the jockey pump rotation direction correct?', type: 'YES_NO' },
    { id: 'jockey_has_energy', label: 'Jokey pompanın enerjisi var mı? / Does jockey pump have energy?', type: 'YES_NO' },
    { id: 'jockey_ul_listed', label: 'Jokey pompa paneli UL listeli mi? / Is the jockey pump controller UL listed?', type: 'YES_NO' },
    { id: 'jockey_pressures_acceptable', label: 'Yukarıdaki basınç ve değerler kabul edilir mi? / Are the above pressures and values acceptable?', type: 'YES_NO' },
  ],
  applicableTo: ['ALL'],
};

// ============================================
// VISUAL INSPECTION - Görsel İnceleme (Page 3 Diesel)
// ============================================
export const visualInspectionSection: FormSection = {
  id: 'visual_inspection',
  title: 'Görsel İnceleme / Visual Inspection',
  titleEn: 'Visual Inspection',
  fields: [
    { id: 'vertical_pipes_5_yearly', label: 'Dikey Borular - Yangın borusu ve hortum sistemi bileşenlerinin yıllık ve 5 yıllık kontrolleri yapıldı mı? / Vertical Pipes - Have annual and 5-yearly checks been carried out?', type: 'YES_NO_NA' },
    { id: 'standpipe_hose_visual', label: 'Dikey boru ve hortum sistemi bileşenlerini yıllık olarak görsel olarak inceleyin / Visually inspect standpipe & hose system components annually', type: 'YES_NO_NA' },
    { id: 'pressure_suction_valves_tested', label: 'Besleme borularındaki basınç tahliye ve vakum kontrol vanalarını test edin / Test pressure-relieving and suction-control valves in supply piping', type: 'YES_NO_NA' },
    { id: 'backflow_preventers_exercised', label: 'Tüm geri akış önleyiciler yıllık ileri akış testi yapılarak kontrol edildi / All backflow preventers exercised annually', type: 'YES_NO_NA' },
    { id: 'pump_strainers_5_yearly', label: 'Yatay ve dikey pompa filtreleri ve ızgaraları - 5 yılda bir kontrol / Horizontal and vertical pump strainers - 5 yearly inspection', type: 'YES_NO_NA' },
    { id: 'turbine_rotating_guards', label: 'Türbin tip pompada dönen kısımlarda muhafaza var mı? / Are there any guards on the rotating parts of the turbine type pump?', type: 'YES_NO_NA' },
  ],
  applicableTo: ['DIZEL'],
};

// ============================================
// MAINTENANCE DATES - Bakım Tarihleri (Diesel Page 3)
// ============================================
export const maintenanceDatesSection: FormSection = {
  id: 'maintenance_dates',
  title: 'Bakım Tarihleri / Maintenance Dates',
  titleEn: 'Maintenance Dates',
  fields: [
    { id: 'oil_filter_change_date', label: 'Yağ filtresi ne zaman değişti? / When was the oil filter changed?', type: 'DATE' },
    { id: 'fuel_filter_change_date', label: 'Yakıt filtresi ne zaman değişti? / When was the fuel filter changed?', type: 'DATE' },
    { id: 'motor_oil_change_date', label: 'Motor yağı ne zaman değişti? / When was the engine oil changed?', type: 'DATE' },
    { id: 'air_filter_change_date', label: 'Hava filtresi ne zaman değişti? / When was the air filter changed?', type: 'DATE' },
    { id: 'antifreeze_change_date', label: 'Antifriz ne zaman değişti? / When was the antifreeze changed?', type: 'DATE' },
    { id: 'diesel_heavy_maintenance_date', label: 'Dizel motor ağır bakım kiti değişti mi? / Has the diesel engine heavy maintenance kit been changed?', type: 'DATE' },
  ],
  applicableTo: ['DIZEL'],
};

// ============================================
// DEFICIENCY NOTES - Kusur Açıklamaları
// ============================================
export const deficiencySection: FormSection = {
  id: 'deficiency',
  title: '6. Kusur Açıklamaları / Deficiency Notes',
  titleEn: 'Deficiency Notes',
  description: 'Kusur derecesi "*" hafif kusuru ve "**" ağır kusuru anlamında kullanılmaktadır / Defect degree "*" means slightly defective and "**" means severely defective',
  fields: [
    { id: 'deficiency_notes', label: 'Kusur Açıklamaları / Deficiency Notes', type: 'TEXTAREA', placeholder: 'Varsa eksiklik ve kusurları not edin / Note any deficiencies or issues' },
  ],
  applicableTo: ['ALL'],
};

// ============================================
// NOTES - Notlar
// ============================================
export const notesSection: FormSection = {
  id: 'notes',
  title: '7. Notlar / Notes',
  titleEn: 'Notes',
  fields: [
    { id: 'general_notes', label: 'Notlar / Notes', type: 'TEXTAREA', placeholder: 'Genel notlar / General notes' },
  ],
  applicableTo: ['ALL'],
};

// ============================================
// CONCLUSION - Sonuç ve Kanaat
// ============================================
export const conclusionSection: FormSection = {
  id: 'conclusion',
  title: '8. Sonuç ve Kanaat / Conclusion',
  titleEn: 'Conclusion and Opinion',
  fields: [
    { id: 'usage_suitable', label: 'Kullanımı uygun (U) / Suitable for use', type: 'CHECKBOX' },
    { id: 'usage_not_suitable', label: 'Kullanımı uygun değil (UD) / Not suitable for use', type: 'CHECKBOX' },
    { id: 'not_applicable', label: 'Yok (Y) / N/A', type: 'CHECKBOX' },
    { id: 'conclusion_text', label: 'Sonuç ve Kanaat / Conclusion', type: 'TEXTAREA', placeholder: 'Genel değerlendirme ve sonuç yazınız / Write general assessment and conclusion' },
  ],
  applicableTo: ['ALL'],
};

// ============================================
// APPROVAL SECTION - Onay (Signatures)
// ============================================
export const approvalSection: FormSection = {
  id: 'approval',
  title: '9. Onay / Approval',
  titleEn: 'Approval',
  fields: [
    { id: 'technician_name', label: 'Teknisyen Adı Soyadı / Technician Name', type: 'TEXT', required: true },
    { id: 'technician_signature', label: 'Teknisyen İmza / Technician Signature', type: 'SIGNATURE', required: true },
    { id: 'customer_name', label: 'Müşteri Temsilcisi Adı Soyadı / Customer Representative Name', type: 'TEXT', required: true },
    { id: 'customer_signature', label: 'Müşteri İmza / Customer Signature', type: 'SIGNATURE', required: true },
    { id: 'approval_date', label: 'Tarih / Date', type: 'DATE', required: true },
  ],
  applicableTo: ['ALL'],
};

// ============================================
// EXPORT ALL SECTIONS FOR DIESEL PUMP FORM
// ============================================
export const dieselPumpFormSections: FormSection[] = [
  measuringInstrumentsSection,
  pumpPerformanceDieselSection,
  controlCriteriaDieselSection,
  generalMaintenanceSection,
  dieselPumpSection1,
  dieselPumpSection2,
  turbinePumpSection,
  visualInspectionSection,
  maintenanceDatesSection,
  deficiencySection,
  notesSection,
  conclusionSection,
  approvalSection,
];

// ============================================
// EXPORT ALL SECTIONS FOR ELECTRIC PUMP FORM
// ============================================
export const electricPumpFormSections: FormSection[] = [
  measuringInstrumentsSection,
  pumpPerformanceElectricSection,
  controlCriteriaElectricSection,
  generalMaintenanceSection,
  electricPumpSection1,
  electricPumpSection2,
  electricPump2Section,
  turbinePumpSection,
  deficiencySection,
  notesSection,
  conclusionSection,
  approvalSection,
];

// ============================================
// EXPORT JOCKEY PUMP FORM SECTIONS
// ============================================
export const jockeyPumpFormSections: FormSection[] = [
  jockeyPumpSection,
  notesSection,
  approvalSection,
];

// Helper function to get sections by pump type
export function getSectionsForPumpType(pumpType: 'ELEKTRIKLI' | 'DIZEL' | null): FormSection[] {
  if (pumpType === 'DIZEL') {
    return dieselPumpFormSections;
  } else if (pumpType === 'ELEKTRIKLI') {
    return electricPumpFormSections;
  }
  // Default to all common sections
  return [
    measuringInstrumentsSection,
    generalMaintenanceSection,
    turbinePumpSection,
    deficiencySection,
    notesSection,
    conclusionSection,
    approvalSection,
  ];
}
