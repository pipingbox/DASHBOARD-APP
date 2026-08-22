export interface LessonSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  table?: {
    headers: string[];
    rows: string[][];
  };
  callout?: {
    type: 'info' | 'warning' | 'danger';
    text: string;
  };
}

export interface LessonContent {
  sections: LessonSection[];
}

export const VCA_LESSONS: Record<number, LessonContent> = {
  "1": {
    "sections": [
      {
        "title": "Health and Safety Legislation Overview",
        "paragraphs": [
          "The Health and Safety (H&S) legislation, also known as ARBO legislation in the Netherlands, describes the rights and obligations of both employers and employees in the area of health and safety at the workplace.",
          "The legislation applies to ALL locations where work is carried out, covering both employers and employees equally."
        ],
        "bullets": [
          "ARBO = Working Conditions (Occupational Health and Safety)",
          "Covers: Health, Safety, and Welfare",
          "Applies to all workplaces without exception",
          "Both employer and employee have responsibilities"
        ]
      },
      {
        "title": "Key Principles of H&S Legislation",
        "paragraphs": [
          "The legislation is built on several fundamental assumptions that ensure comprehensive workplace safety."
        ],
        "bullets": [
          "Support provided by experts or services (prevention workers)",
          "Collaboration between multiple employers at one location",
          "Consulting and collaborating with employee representatives",
          "Risk Inventory and Evaluation (RI&E) is mandatory"
        ],
        "callout": {
          "type": "info",
          "text": "The H&S legislation does NOT relate to Security - only to Health, Safety, and Welfare."
        }
      },
      {
        "title": "The Labour Inspectorate",
        "paragraphs": [
          "The Labour Inspectorate (Inspection Service) supervises compliance with H&S legislation and has significant enforcement powers."
        ],
        "bullets": [
          "Can impose a work prohibition order (stop work)",
          "Can impose fines for violations",
          "Can carry out investigations at companies",
          "Cannot dismiss employees - that is the employer role"
        ],
        "callout": {
          "type": "warning",
          "text": "The Inspection Service can have work STOPPED immediately if there is serious danger to workers."
        }
      },
      {
        "title": "CE Marking and Working Hours",
        "paragraphs": [
          "The CE mark indicates that an article meets the minimum European requirements. It must be attached by the manufacturer or importer.",
          "The Working Hours legislation delineates maximum working hours and minimum rest hours to prevent safety and health being endangered, and promotes the possibility to combine work and care tasks."
        ],
        "bullets": [
          "CE mark = minimum European safety requirements",
          "Must be on every piece of equipment marketed and used",
          "Working hours legislation protects against overwork",
          "Promotes work-life balance"
        ]
      }
    ]
  },
  "2": {
    "sections": [
      {
        "title": "Understanding Risk",
        "paragraphs": [
          "Risk is defined as the combination of probability and effect. This formula helps us quantify and prioritize workplace hazards."
        ],
        "bullets": [
          "Risk = Probability x Effect",
          "Higher probability OR higher effect = higher risk",
          "Risk assessment helps prioritize safety measures",
          "Both unsafe situations and unsafe actions contribute to risk"
        ],
        "callout": {
          "type": "info",
          "text": "Risk = Probability x Effect. This is the fundamental formula for all risk assessments in workplace safety."
        }
      },
      {
        "title": "Sources of Danger",
        "paragraphs": [
          "Hazards at the workplace come from multiple sources including equipment, substances, and human behaviour. Problems at home are NOT considered a workplace hazard source."
        ],
        "bullets": [
          "Equipment and machinery",
          "Hazardous substances",
          "Noise and radiation",
          "Working methods and procedures",
          "Human behaviour at work"
        ]
      },
      {
        "title": "Prevention Methods",
        "paragraphs": [
          "Prevention can be tackled by preventing both unsafe situations AND unsafe actions. The best way to deal with unsafe situations is to remove the cause entirely."
        ],
        "bullets": [
          "Remove the hazard at the source",
          "Use collective protective measures",
          "Apply personal protective equipment (PPE)",
          "Provide information and training"
        ],
        "callout": {
          "type": "warning",
          "text": "An unsafe situation is one where work is carried out WITHOUT complying with conditions for safe working, which can lead to an accident."
        }
      },
      {
        "title": "RI&E and LMRA",
        "paragraphs": [
          "The Risk Inventory and Evaluation (RI&E) follows three steps: 1) Identifying hazards, 2) Making an inventory of risks, 3) Evaluating the risks. LMRA stands for Last Minute Risk Analysis - a quick safety check before starting work."
        ],
        "bullets": [
          "RI&E: systematic risk assessment of the workplace",
          "LMRA: Last Minute Risk Analysis before each task",
          "Work planning determines safe working methods",
          "Both are essential tools for prevention"
        ]
      }
    ]
  },
  "3": {
    "sections": [
      {
        "title": "Causes of Accidents",
        "paragraphs": [
          "According to Lateiner, three factors play a role in accidents: Background, Human error, and Unsafe situations/operations. The two direct causes are unsafe actions and unsafe situations."
        ],
        "bullets": [
          "Background factors (organizational, personal)",
          "Human error (person-related factors)",
          "Unsafe situations (environmental conditions)",
          "Unsafe actions (behavioural factors)"
        ]
      },
      {
        "title": "Person-Related Factors",
        "paragraphs": [
          "Person-related factors that can lead to incidents include insufficient attention and insufficient experience. Insufficient planning is NOT a person-related factor - it is an organizational factor."
        ],
        "bullets": [
          "Insufficient attention or concentration",
          "Insufficient experience or training",
          "Physical limitations",
          "Fatigue or illness"
        ],
        "callout": {
          "type": "info",
          "text": "Insufficient PLANNING is an organizational factor, not a person-related factor."
        }
      },
      {
        "title": "Reporting and Investigation",
        "paragraphs": [
          "All accidents and near-accidents must be recorded. Accidents must be reported to the immediate supervisor. The hiring company is responsible for accident investigations."
        ],
        "bullets": [
          "Report to immediate supervisor",
          "Record ALL accidents and near-misses",
          "Final report must include: Analysis, Conclusions, Recommendations",
          "Investigation identifies root causes for prevention"
        ]
      },
      {
        "title": "Prevention Measures",
        "paragraphs": [
          "Drawing up procedures for action when accidents occur is a measure towards Organization. Prevention measures target three areas: surroundings, organization, and human beings."
        ],
        "bullets": [
          "Organizational measures: procedures, training",
          "Environmental measures: engineering controls",
          "Human measures: awareness, competence",
          "Continuous improvement through investigation findings"
        ]
      }
    ]
  },
  "4": {
    "sections": [
      {
        "title": "Causes of Unsafe Behaviour",
        "paragraphs": [
          "Unsafe behaviour has identifiable causes including lack of example function and unwillingness. Good formulated objectives are NOT a cause of unsafe behaviour - they actually promote safety."
        ],
        "bullets": [
          "Lack of example function (poor leadership)",
          "Unwillingness (not wanting to work safely)",
          "Inability (not knowing how)",
          "Lack of awareness"
        ],
        "callout": {
          "type": "info",
          "text": "Good formulated objectives PROMOTE safe behaviour - they are not a cause of unsafe behaviour."
        }
      },
      {
        "title": "Role of the Supervisor",
        "paragraphs": [
          "The supervisor is crucial for safety because they have the required information about employees, the work, and the circumstances. Clarity about the priority of safe working is the key policy element that influences behaviour."
        ],
        "bullets": [
          "Has information about employees, work, and circumstances",
          "Sets the example for safe working",
          "Provides clarity about safety priorities",
          "Monitors and corrects unsafe behaviour"
        ]
      },
      {
        "title": "Rules for Safe Behaviour",
        "paragraphs": [
          "Being critical towards yourself is a general rule for safe working. You should think about both your own safety AND that of others."
        ],
        "bullets": [
          "Be critical towards yourself",
          "Think about others safety too",
          "Report unsafe situations immediately",
          "Intervene when you see unsafe actions",
          "Maintain personal hygiene, order and tidiness"
        ]
      },
      {
        "title": "Alcohol and Drugs",
        "paragraphs": [
          "Alcohol and drugs cause reduced or problematic working. In the event of chronic problematic use, searching for help is expected."
        ],
        "bullets": [
          "Causes reduced concentration and judgement",
          "Zero tolerance at the workplace",
          "Seek help for chronic problematic use",
          "Inform supervisor about any issues"
        ],
        "callout": {
          "type": "danger",
          "text": "Alcohol and drugs cause REDUCED or PROBLEMATIC working. Never work under the influence."
        }
      }
    ]
  },
  "5": {
    "sections": [
      {
        "title": "Employer Obligations",
        "paragraphs": [
          "Employers must provide information and instruction about hazards at work. This is a fundamental obligation under H&S legislation."
        ],
        "bullets": [
          "Provide information about workplace hazards",
          "Provide instruction and training",
          "Ensure safe working conditions",
          "Conduct Risk Inventory and Evaluation",
          "Provide personal protective equipment"
        ]
      },
      {
        "title": "Employee Obligations",
        "paragraphs": [
          "Employees must report hazardous situations or risks to health and safety to the manager/supervisor. They also have the right to interrupt work if immediate and serious danger occurs."
        ],
        "bullets": [
          "Report hazardous situations to supervisor",
          "Use PPE correctly",
          "Follow safety instructions",
          "Right to stop work in immediate danger"
        ],
        "callout": {
          "type": "warning",
          "text": "Employees have the RIGHT to interrupt work if immediate and serious danger for human beings occurs."
        }
      },
      {
        "title": "Works Council and SCC",
        "paragraphs": [
          "The works council consultation involves employer and employee representatives. SCC* focuses on direct safety control, while SCC** also includes safety structures."
        ],
        "bullets": [
          "Works council: employer + employee representatives",
          "SCC* = direct safety control",
          "SCC** = safety control + safety structures",
          "Workplace inspections increase safety awareness"
        ]
      },
      {
        "title": "Temporary Work Relationships",
        "paragraphs": [
          "In temporary work, there is a triangular relationship between the temporary employment agency, the hiring company, and the temporary agency worker. The actual employer (hiring company) is responsible for working conditions."
        ],
        "bullets": [
          "Triangular relationship: agency - hiring company - worker",
          "Hiring company responsible for working conditions",
          "Agency responsible for occupational accident insurance",
          "Shared duty to pass on information"
        ]
      }
    ]
  },
  "6": {
    "sections": [
      {
        "title": "General Safety Rules",
        "paragraphs": [
          "General safety rules must be recorded in writing and are intended for temporary agency workers among others. The procedure for reporting a fire falls under general safety rules."
        ],
        "bullets": [
          "Must be recorded in writing",
          "Intended for all workers including temporary staff",
          "Cover fire reporting procedures",
          "Should be understood by native speakers"
        ]
      },
      {
        "title": "Specific Safety Rules",
        "paragraphs": [
          "Specific safety rules relate to particular hazards like ventilation and entering confined spaces. They do NOT relate to lunch breaks."
        ],
        "bullets": [
          "Relate to specific hazards",
          "Cover ventilation requirements",
          "Cover confined space entry",
          "Do NOT cover lunch breaks"
        ],
        "callout": {
          "type": "info",
          "text": "Specific safety rules should be understood by native speakers - language comprehension is essential for safety."
        }
      },
      {
        "title": "Work Permits",
        "paragraphs": [
          "A work permit must describe the measures to be taken by the issuer and the permit holder. It covers what activities will take place, where, and how - but NOT why."
        ],
        "bullets": [
          "Describes measures for issuer and holder",
          "States what, where, and how",
          "Does NOT need to state why",
          "Lists all required PPE",
          "Defines operational employee measures"
        ]
      },
      {
        "title": "Connection Flanges",
        "paragraphs": [
          "A connection flange serves dual purposes: to shut off supply lines to vessels, tanks or installations, AND to separate sections of pipe."
        ],
        "bullets": [
          "Shut off supply lines",
          "Separate pipe sections",
          "Critical for isolation procedures",
          "Part of safe work preparation"
        ]
      }
    ]
  },
  "7": {
    "sections": [
      {
        "title": "Emergency Response Officers",
        "paragraphs": [
          "Emergency response officers (BHV) have specific tasks including extinguishing starting fires and restricting damage and injury."
        ],
        "bullets": [
          "Extinguish starting fires",
          "Restrict damage and injury",
          "Evacuate personnel",
          "Provide first aid",
          "Guide emergency services"
        ]
      },
      {
        "title": "Company Emergency Plan",
        "paragraphs": [
          "A company emergency plan describes measures and provisions prepared for emergency situations. Its purpose is to limit the effects of possible emergency situations."
        ],
        "bullets": [
          "Describes prepared measures and provisions",
          "Limits effects of emergencies",
          "Covers all types of emergency situations",
          "Must be regularly practiced and updated"
        ],
        "callout": {
          "type": "warning",
          "text": "Emergency situations include: accidents, fire, explosion, uncontrolled escape of substances, bad weather, natural disasters, social unrest, and terrorist attacks."
        }
      },
      {
        "title": "Phases of Emergency Control",
        "paragraphs": [
          "Emergency control has defined phases. The first alarm describes how an emergency can be reported and what information must be communicated. Note: there is no second alarm phase."
        ],
        "bullets": [
          "First alarm: how to report and what to communicate",
          "Response: actions by emergency team",
          "Termination: declared by authorised person",
          "Recovery: return to normal operations"
        ]
      },
      {
        "title": "Evacuation and First Aid",
        "paragraphs": [
          "The correct evacuation sequence is: 1) Stop work, 2) Do not use lifts, 3) Report presence at assembly point. First aid equipment must always be available."
        ],
        "bullets": [
          "Stop work immediately",
          "Do not use lifts/elevators",
          "Report presence at assembly point",
          "First aid equipment always available",
          "Trained emergency response members required"
        ]
      }
    ]
  },
  "8": {
    "sections": [
      {
        "title": "Identifying Hazardous Substances",
        "paragraphs": [
          "Hazardous substances are materials that pose a danger to health and/or the environment. They are indicated with a square danger symbol, black on an orange background. R phrases on labels indicate the risks."
        ],
        "bullets": [
          "Danger symbol: black on orange background",
          "R phrases = Risk phrases (identify hazards)",
          "S phrases = Safety phrases (precautions)",
          "Material Safety Data Sheet (MSDS) provides full information"
        ],
        "callout": {
          "type": "info",
          "text": "R phrases tell you the RISKS. S phrases tell you the SAFETY measures. The hazard diamond numbers go from 0 to 4."
        }
      },
      {
        "title": "Oxygen and Ventilation",
        "paragraphs": [
          "Under normal conditions, oxygen in the air is 21%. Lack of ventilation can cause oxygen concentration to become too low, creating a suffocation hazard."
        ],
        "bullets": [
          "Normal oxygen level: 21%",
          "Below 19%: danger zone",
          "Lack of ventilation reduces oxygen",
          "Gas cylinders: white shoulder = oxygen"
        ]
      },
      {
        "title": "Carbon Monoxide and Asbestos",
        "paragraphs": [
          "Carbon monoxide prevents oxygen from being absorbed into the blood. Asbestos exposure can cause mesothelioma. New use and processing of asbestos is NOT allowed."
        ],
        "bullets": [
          "CO: oxygen no longer absorbed into blood",
          "Asbestos: causes mesothelioma",
          "Found in roofing, wall cladding, furnace brickwork",
          "NOT found in newly built houses",
          "New use/processing is prohibited"
        ],
        "callout": {
          "type": "danger",
          "text": "Carbon monoxide is odourless and colourless - you cannot detect it without instruments. It prevents oxygen absorption in the blood."
        }
      },
      {
        "title": "Biological Substances and Storage",
        "paragraphs": [
          "Biological substances can be present in agriculture and contaminated soil. Vaccinations are a precautionary measure. Gas cylinders must be secured properly when stored."
        ],
        "bullets": [
          "Biological agents: agriculture, contaminated soil",
          "Vaccinations as precautionary measure",
          "Gas cylinders: secure properly",
          "Organic solvents: flammable/highly flammable",
          "Leaks: professional removal of spilt product"
        ]
      }
    ]
  },
  "9": {
    "sections": [
      {
        "title": "Fire Fundamentals",
        "paragraphs": [
          "Fire requires fuel, oxygen, and an ignition source. A flammable substance is needed for a fire or explosion. Excess oxygen makes ignition of flammable substances easier."
        ],
        "bullets": [
          "Fuel: the material that burns",
          "Oxygen: normally 21% in air",
          "Ignition source: spark, flame, heat",
          "Excess oxygen = easier ignition"
        ]
      },
      {
        "title": "Fire Classes",
        "table": {
          "headers": [
            "Class",
            "Materials",
            "Examples"
          ],
          "rows": [
            [
              "A",
              "Solid materials",
              "Wood, paper, plastic, textile"
            ],
            [
              "B",
              "Liquids",
              "Petrol, oil, alcohol, paint"
            ],
            [
              "C",
              "Gases",
              "Methane, propane, butane, acetylene"
            ],
            [
              "D",
              "Metals",
              "Magnesium, aluminium, sodium"
            ]
          ]
        },
        "callout": {
          "type": "danger",
          "text": "NEVER use water on Class B (liquid) fires! Burning liquids splatter and float on water, spreading the fire."
        }
      },
      {
        "title": "Explosions and Flash Point",
        "paragraphs": [
          "An explosion is a very rapidly developing fire that releases a pressure wave. The explosion limit is the highest or lowest concentration of a gas in air at which an explosion can occur. The flash point is the lowest temperature of a liquid at which vapour can be ignited."
        ],
        "bullets": [
          "Explosion = rapid fire + pressure wave",
          "Explosion limit: gas concentration boundaries",
          "Flash point: lowest ignition temperature for liquid vapour",
          "Ex sign indicates explosion risk zone"
        ]
      },
      {
        "title": "Extinguishing Methods",
        "paragraphs": [
          "When a fire is detected, first report it. Fire blankets exclude oxygen. Carbon dioxide displaces oxygen but can create a suffocating atmosphere and cause freeze wounds. Sand excludes oxygen. When treating burns, flush with water for at least 15 minutes."
        ],
        "bullets": [
          "First action: REPORT the fire",
          "Fire blankets: exclude oxygen",
          "CO2: displaces oxygen (suffocation risk + freeze wounds)",
          "Sand: excludes oxygen",
          "Burns: flush 15 minutes minimum",
          "Hot work watch requires specific training"
        ],
        "callout": {
          "type": "warning",
          "text": "When treating burns: flush with water for at least 15 MINUTES. Not 5, not 10 - fifteen minutes minimum."
        }
      }
    ]
  },
  "10": {
    "sections": [
      {
        "title": "Hand Tools Safety",
        "paragraphs": [
          "Chisels must have no burrs on the cutting edge. Hammers must have a handle secured in the hammer-head. When working with knives, do not slide an extendable blade too far out."
        ],
        "bullets": [
          "Chisels: no burrs on cutting edge",
          "Hammers: handle secured in hammer-head",
          "Knives: do not extend blade too far",
          "Saws: blade must be well tensioned",
          "Small workpieces: must be clamped"
        ]
      },
      {
        "title": "Power Tools and Machines",
        "paragraphs": [
          "Electrical hand tools for 230 volts must be double insulated. A dead man switch immediately stops the machine when the handle is released. The emergency stop provides the quickest way to stop a machine."
        ],
        "bullets": [
          "230V tools: must be double insulated",
          "Dead man switch: stops when released",
          "Emergency stop: quickest stop method",
          "Periodic inspection required for all machines",
          "Never wear gloves with rotating parts"
        ],
        "callout": {
          "type": "danger",
          "text": "NEVER wear gloves when working with machines that have rotating parts - the glove and your hand can be dragged into the machine."
        }
      },
      {
        "title": "Circular Saws and Grinders",
        "paragraphs": [
          "A table circular saw must have a blade guard attached to a robust stand. A riving knife is used with a hand-held circular saw. Grinding discs must show the manufacturer name."
        ],
        "bullets": [
          "Table circular saw: blade guard on robust stand",
          "Riving knife: for hand-held circular saw",
          "Grinding disc: must show manufacturer name",
          "Chain saw: requires special fibre trousers and gloves",
          "Nailer/stapler: protection against undesired firing"
        ]
      },
      {
        "title": "Forklift Trucks and Vehicles",
        "paragraphs": [
          "A pallet trolley has a lifting height of 20 cm. Forklift truck drivers must possess tested expertise AND use a safety belt. You cannot increase the contra weight."
        ],
        "bullets": [
          "Pallet trolley: 20 cm lifting height",
          "Forklift: tested expertise + safety belt required",
          "Cannot increase contra weight",
          "No passengers without special seat",
          "Pneumatic tools: shut off air supply after use"
        ]
      }
    ]
  },
  "11": {
    "sections": [
      {
        "title": "Hazards During Demolition",
        "paragraphs": [
          "Demolition work presents multiple hazards including instability of the demolition front AND protruding parts of construction. Both are equally dangerous."
        ],
        "bullets": [
          "Instability of demolition front",
          "Protruding parts of construction",
          "Falling debris and materials",
          "Dust and hazardous substances",
          "Structural collapse risk"
        ]
      },
      {
        "title": "Safety Measures",
        "paragraphs": [
          "During demolition work, a fall arrest device is mandatory. When removing ceramic fibres, do not use a chute to prevent fibre dispersal."
        ],
        "bullets": [
          "Fall arrest device is mandatory",
          "Do not use a chute for ceramic fibres",
          "Proper PPE at all times",
          "Controlled demolition sequences",
          "Exclusion zones for non-workers"
        ],
        "callout": {
          "type": "warning",
          "text": "When removing ceramic fibres: Do NOT use a chute. This prevents dangerous fibre dispersal into the air."
        }
      },
      {
        "title": "Planning and Procedures",
        "paragraphs": [
          "All demolition work requires careful planning, proper risk assessment, and clear procedures for each phase of the demolition process."
        ],
        "bullets": [
          "Risk assessment before starting",
          "Clear demolition sequence planned",
          "Emergency procedures in place",
          "Regular structural stability checks",
          "Proper waste handling procedures"
        ]
      }
    ]
  },
  "12": {
    "sections": [
      {
        "title": "Gas Welding Safety",
        "paragraphs": [
          "When gas welding with oxygen and acetylene, cylinders must be stored upright or at an angle of at least 30 degrees. Backdraft is a significant risk of gas welding."
        ],
        "bullets": [
          "Acetylene cylinders: upright or minimum 30 degrees",
          "Backdraft is a major risk",
          "Check connections for leaks",
          "Use flashback arrestors",
          "Store oxygen and fuel gas separately"
        ],
        "callout": {
          "type": "danger",
          "text": "Acetylene cylinders must be stored upright or at an angle of at least 30 degrees. Never lay them flat."
        }
      },
      {
        "title": "Electric Welding",
        "paragraphs": [
          "Electric welding requires comprehensive personal protection and welding curtains to protect nearby people from UV and infrared radiation. Burnt cornea due to heat radiation is NOT a risk - blinding from infrared radiation IS."
        ],
        "bullets": [
          "Welding mask, apron, clothing, safety shoes",
          "Welding curtains for UV/infrared protection",
          "Risk: blinding from infrared radiation",
          "Risk: lung complaints from welding smoke",
          "NOT a risk: burnt cornea from heat radiation"
        ]
      },
      {
        "title": "Hot Work Procedures",
        "paragraphs": [
          "All welding, cutting and burning operations require proper permits, fire watches, and safety measures to prevent fires and explosions."
        ],
        "bullets": [
          "Hot work permit required",
          "Fire watch during and after work",
          "Remove flammable materials from area",
          "Check for explosive atmospheres",
          "Adequate ventilation essential"
        ]
      }
    ]
  },
  "13": {
    "sections": [
      {
        "title": "Why Careful Excavation Matters",
        "paragraphs": [
          "Careful excavation is important for the security of delivery of utility companies. Damaging underground services can cause serious incidents."
        ],
        "bullets": [
          "Security of utility delivery",
          "Gas pipes: suffocation risk if damaged",
          "Live cables: electrocution risk",
          "Water mains: flooding risk",
          "Communication cables: service disruption"
        ]
      },
      {
        "title": "Rules for Safe Excavation",
        "paragraphs": [
          "Before excavating, the position of cables and pipes must be determined by test trenches within 1.5 metres. Any different position or damage must be reported to the person in charge."
        ],
        "bullets": [
          "Test trenches within 1.5m of expected position",
          "Report any differences or damage immediately",
          "Hand dig near known services",
          "Use cable/pipe locating equipment",
          "Follow utility company guidance"
        ],
        "callout": {
          "type": "warning",
          "text": "Explosion hazard is NOT directly a risk of excavating itself - but suffocation (gas) and electrocution (cables) ARE direct risks."
        }
      },
      {
        "title": "Working in Excavations",
        "paragraphs": [
          "When working in or near an excavation, effective strutting and slope provisions are essential to prevent collapse."
        ],
        "bullets": [
          "Effective strutting required",
          "Proper slope provisions",
          "Edge protection for workers above",
          "Safe access/egress routes",
          "Regular stability inspections"
        ]
      }
    ]
  },
  "14": {
    "sections": [
      {
        "title": "Legal Requirements",
        "paragraphs": [
          "From 2.5 meters height, the employer must take legally required measures to prevent risks of falling. A safety harness is the measure that reduces danger for everyone working on a flat roof."
        ],
        "bullets": [
          "2.5 meters: legal measures required",
          "Safety harness for flat roof work",
          "Collective protection preferred over individual",
          "Risk assessment for all height work"
        ]
      },
      {
        "title": "Ladders",
        "paragraphs": [
          "Before use, check that the ladder is set up at an angle of approximately 75 degrees. Ladders are used for carrying out minor activities and bridging heights. The reach at maximum one arm length is a key rule."
        ],
        "bullets": [
          "Angle: approximately 75 degrees",
          "Used for minor activities + bridging height",
          "Maximum one arm length reach",
          "Three points of contact when climbing",
          "Secure at top or have someone hold it"
        ],
        "callout": {
          "type": "info",
          "text": "A ladder must be set up at approximately 75 degrees. Too steep = tipping backward. Too shallow = sliding out."
        }
      },
      {
        "title": "Scaffolding",
        "paragraphs": [
          "Rolling scaffolds must be climbed from the inside. Persons in a suspended scaffold must use a safety harness. Floor openings should preferably be covered with solid material."
        ],
        "bullets": [
          "Rolling scaffold: climb from inside",
          "Suspended scaffold: safety harness required",
          "Floor openings: cover with solid material",
          "Guard rails on all open sides",
          "Regular inspection of scaffold components"
        ]
      },
      {
        "title": "Floor and Wall Openings",
        "paragraphs": [
          "Hazards include being struck by falling objects and falling through openings. Closing a large floor opening is NOT a hazard - it is a safety measure."
        ],
        "bullets": [
          "Falling through openings",
          "Being struck by objects falling through",
          "Cover openings with solid material",
          "Use guard rails where covering not possible",
          "Mark all openings clearly"
        ]
      }
    ]
  },
  "15": {
    "sections": [
      {
        "title": "Fundamental Dangers",
        "paragraphs": [
          "A layman is NEVER allowed to work on live electrical installations, even with expert permission. The greatest danger from current through the body is flow through the heart. Electrocution is caused by the use of electricity."
        ],
        "bullets": [
          "Laymen: NEVER on live installations",
          "Greatest danger: current through the heart",
          "Lack of earthing causes accidents",
          "Current intensity and duration determine injury",
          "Skin thickness does NOT affect injury"
        ],
        "callout": {
          "type": "danger",
          "text": "A layman is NEVER allowed to work on live electrical installations - not even with permission from an expert."
        }
      },
      {
        "title": "Safe Voltages",
        "table": {
          "headers": [
            "Type",
            "Maximum Safe Voltage",
            "Application"
          ],
          "rows": [
            [
              "Direct current",
              "120V",
              "Confined spaces"
            ],
            [
              "Alternating current",
              "50V",
              "Confined spaces"
            ],
            [
              "Earth leakage breaker",
              "30 mA",
              "Construction sites"
            ]
          ]
        },
        "callout": {
          "type": "info",
          "text": "In confined spaces: max 120V DC or max 50V AC. Construction site junction boxes need 30 mA earth leakage protection."
        }
      },
      {
        "title": "Static Electricity and Short Circuits",
        "paragraphs": [
          "A short circuit occurs when two parts at different voltages come in direct contact. Static electricity hazards include sparks and damage to electronic equipment. Antistatic shoes are worn when working with static electricity."
        ],
        "bullets": [
          "Short circuit: different voltages in contact",
          "Static: sparks + equipment damage",
          "Antistatic shoes for static electricity work",
          "Static does NOT occur in low oxygen rooms",
          "Cable reels: always fully unwind"
        ]
      },
      {
        "title": "Cable and Equipment Safety",
        "paragraphs": [
          "Cable reels must be completely unwound to prevent overheating and fire. Power cables can be overloaded. Always visually check equipment before use and report damage."
        ],
        "bullets": [
          "Unwind cable reels completely (fire risk)",
          "Overloading is the main cable hazard",
          "Visual check before every use",
          "Report damage - do not use",
          "Scaffolding must be earthed"
        ]
      }
    ]
  },
  "16": {
    "sections": [
      {
        "title": "What is a Confined Space?",
        "paragraphs": [
          "A confined space has characteristics like enough work space but poor ventilation and limited access. Storage reservoirs, tanks, and welding tents near deep excavations are examples."
        ],
        "bullets": [
          "Limited access and egress",
          "Poor natural ventilation",
          "Not designed for continuous occupancy",
          "Examples: tanks, reservoirs, silos, sewers",
          "NOT just narrow/small/wet spaces"
        ]
      },
      {
        "title": "Hazards and Measurements",
        "paragraphs": [
          "Suffocation occurs through insufficient oxygen concentration. Measurements must be carried out by an expert person - not the supervisor or the worker in the space."
        ],
        "bullets": [
          "Suffocation: insufficient oxygen (below 19%)",
          "Measurements by expert person only",
          "Check oxygen, flammable gases, toxic gases",
          "Continuous monitoring during work",
          "Safe voltage: 120V DC in confined spaces"
        ],
        "callout": {
          "type": "danger",
          "text": "Suffocation hazard: caused by INSUFFICIENT oxygen concentration. High oxygen is a fire risk, not a suffocation risk."
        }
      },
      {
        "title": "Manhole Guard and Supervision",
        "paragraphs": [
          "A manhole guard is compulsory for as long as there is someone in the enclosed space. The permanent attendant must possess demonstrably tested expertise. Duration of stay must be as short as possible."
        ],
        "bullets": [
          "Manhole guard: compulsory entire time",
          "Attendant: tested expertise required",
          "Stay as short as possible",
          "Warning emergency services if danger",
          "Communication maintained at all times"
        ]
      },
      {
        "title": "Electrical Safety in Confined Spaces",
        "paragraphs": [
          "Safe voltage in confined spaces with conducting walls is 120V direct current. Remove electricity from equipment correctly, and use safe voltages."
        ],
        "bullets": [
          "120V DC maximum in conducting spaces",
          "50V AC maximum",
          "Remove electricity correctly before entry",
          "Use battery-powered tools where possible",
          "Earth leakage protection essential"
        ]
      }
    ]
  },
  "17": {
    "sections": [
      {
        "title": "Hoisting Equipment",
        "paragraphs": [
          "Hoisting equipment can move loads both vertically and horizontally. Examples include tower cranes and rolling bridges. A pallet trolley is NOT hoisting equipment."
        ],
        "bullets": [
          "Tower cranes",
          "Rolling bridges (overhead cranes)",
          "Mobile cranes",
          "NOT pallet trolleys",
          "Can move loads vertically AND horizontally"
        ]
      },
      {
        "title": "Hoisting Tools",
        "paragraphs": [
          "A harness belt is a hoisting tool. Two slings on a steel ring are called a two-legged bridle. Steel cables must not be knotted and should not be used when very rusty."
        ],
        "bullets": [
          "Harness belt = hoisting tool",
          "Two-legged bridle: 2 slings on steel ring",
          "Steel cables: never knot them",
          "Chains: use edge protectors on sharp edges",
          "Crane logbook: records all inspections"
        ]
      },
      {
        "title": "Safety Measures",
        "paragraphs": [
          "General dangers include load falling and hoisting equipment toppling. Outriggers are used with hoisting equipment to prevent toppling. Operations must be suspended above wind force 5."
        ],
        "bullets": [
          "Dangers: load falling, equipment toppling",
          "Outriggers prevent toppling",
          "Suspend operations above wind force 5",
          "Follow manufacturer windforce instructions",
          "Never stand under suspended loads"
        ],
        "callout": {
          "type": "warning",
          "text": "Hoisting operations must be suspended above wind force 5. Always check the crane manufacturer instructions for specific windforce limits."
        }
      }
    ]
  },
  "18": {
    "sections": [
      {
        "title": "Types of Radiation",
        "paragraphs": [
          "Infrared radiation is non-ionizing radiation. Non-ionizing radiation is weaker than ionizing radiation. The key difference is that ionizing radiation can create ions in body tissue."
        ],
        "bullets": [
          "Ionizing: X-rays, gamma rays, nuclear",
          "Non-ionizing: infrared, UV, radio waves, microwaves",
          "Non-ionizing is WEAKER than ionizing",
          "Ionizing creates ions in tissue (more dangerous)"
        ]
      },
      {
        "title": "Safety Measures",
        "paragraphs": [
          "For ionizing radiation: keep as far away as possible AND cordon off the area. For non-ionizing radiation: follow instructions on appliances and respect duration limits."
        ],
        "bullets": [
          "Ionizing: distance + shielding + time",
          "Cordon off area around ionizing sources",
          "Non-ionizing: follow appliance instructions",
          "Respect duration of use limits",
          "Medical examination for ionizing radiation workers"
        ],
        "callout": {
          "type": "warning",
          "text": "Workers with ionizing radiation sources must have medical examinations. The radiation expert monitors radiation safety and hygiene."
        }
      },
      {
        "title": "Responsibilities",
        "paragraphs": [
          "Monitoring radiation safety and hygiene is the task of the radiation expert - not the supervisor or emergency response team."
        ],
        "bullets": [
          "Radiation expert: monitors safety and hygiene",
          "Medical examinations: mandatory for radiation workers",
          "Supervisor: ensures rules are followed",
          "Emergency team: handles radiation incidents"
        ]
      }
    ]
  },
  "19": {
    "sections": [
      {
        "title": "Working Environment Conditions",
        "paragraphs": [
          "The working environment is determined by vibration, lighting, temperature, and noise. The supervisor does NOT determine working environment conditions - they manage people."
        ],
        "bullets": [
          "Vibration (hand/arm and whole body)",
          "Lighting levels",
          "Temperature and humidity",
          "Noise levels",
          "NOT determined by the supervisor"
        ],
        "callout": {
          "type": "info",
          "text": "The SUPERVISOR does not determine working environment conditions. Physical factors like vibration, lighting, and temperature do."
        }
      },
      {
        "title": "Vibrations and Physical Stress",
        "paragraphs": [
          "Physical vibrations include hand/arm vibrations from mechanical tools and whole-body vibrations from vehicles. Infections to the skin are NOT caused by vibrations. Physical stress is influenced by working position/posture AND the movements that must be made."
        ],
        "bullets": [
          "Hand/arm: from mechanical handheld tools",
          "Whole body: from vehicles, installations, floors",
          "NOT caused: skin infections",
          "Physical stress: posture + movements",
          "Breaks prevent overloading"
        ]
      },
      {
        "title": "Manual Lifting",
        "paragraphs": [
          "The advised maximum weight for manual lifting is 25 kg. Correct posture: lift with a straight back, bend knees, and keep the load as close as possible to the body."
        ],
        "bullets": [
          "Maximum 25 kg for manual lifting",
          "Straight back + bend knees",
          "Keep load close to body",
          "Plan the lift before starting",
          "Get help for heavy/awkward loads"
        ],
        "callout": {
          "type": "warning",
          "text": "Manual lifting maximum: 25 kg. Always lift with a STRAIGHT BACK and BENT KNEES, keeping the load CLOSE to your body."
        }
      },
      {
        "title": "Sitting and Standing Work",
        "paragraphs": [
          "The optimum sitting position includes good upper leg support AND shoulder relief. A guideline is to ensure an optimal position but change positions regularly. Standing is NOT preferred when forces exceeding 30N must be used."
        ],
        "bullets": [
          "Good upper leg support on seat",
          "Shoulder relief (arm supports)",
          "Change positions regularly",
          "Standing preferred for reaching tasks",
          "Standing NOT preferred for forces over 30N"
        ]
      }
    ]
  },
  "20": {
    "sections": [
      {
        "title": "Effects of Noise",
        "paragraphs": [
          "Excessively loud noise increases risk in the workplace by masking warning signals and reducing concentration. Exposure to excess noise causes loss of concentration."
        ],
        "bullets": [
          "Increases workplace risk",
          "Causes loss of concentration",
          "Masks warning signals",
          "Can cause permanent hearing damage",
          "Measured in Decibels (dB)"
        ]
      },
      {
        "title": "Sound Physics",
        "paragraphs": [
          "Two equal sound sources together increase the sound level by 3 dB. Doubling the distance gives approximately 6 dB(A) reduction. Pitch and strength determine whether noise is harmful."
        ],
        "bullets": [
          "Two equal sources: +3 dB",
          "Double distance: -6 dB(A)",
          "Harmful factors: pitch and strength",
          "Permanent hearing loss: difficulty with phone calls",
          "Unit of measurement: Decibel (dB)"
        ],
        "callout": {
          "type": "info",
          "text": "Two equal sound sources = +3 dB. Double the distance = -6 dB(A). These are key numbers for the exam."
        }
      },
      {
        "title": "Noise Control Hierarchy",
        "paragraphs": [
          "The correct order is: 1) Reduce source, 2) Screen off the source, 3) Damp noise vibrations, 4) Use personal hearing protection. From 80 dB(A), the employer must provide hearing examination and make hearing protection available."
        ],
        "bullets": [
          "1. Reduce at source",
          "2. Screen off the source",
          "3. Damp noise vibrations",
          "4. Personal hearing protection (last resort)",
          "From 80 dB(A): hearing exam + protection available",
          "From 85 dB(A): hearing protection mandatory"
        ]
      }
    ]
  },
  "21": {
    "sections": [
      {
        "title": "General PPE Requirements",
        "paragraphs": [
          "All PPE must be tested. Metal safety helmets should not be worn in industry because they can conduct electricity. PPE is the last line of defence after engineering and organizational controls."
        ],
        "bullets": [
          "Must be tested and certified",
          "Metal helmets conduct electricity",
          "Last line of defence",
          "Must fit properly",
          "Regular inspection required"
        ]
      },
      {
        "title": "Head and Eye Protection",
        "paragraphs": [
          "A safety helmet interior absorbs shocks and distributes them over the head. Safety goggles protect from acid splashes. Welding masks protect from infrared radiation while goggles protect from flying particles."
        ],
        "bullets": [
          "Helmet interior: absorbs and distributes shock",
          "Head hazards: impact + falling objects",
          "Safety goggles: acid splash protection",
          "Welding mask: infrared radiation protection",
          "Safety glasses: flying particle protection"
        ]
      },
      {
        "title": "Respiratory and Hearing Protection",
        "paragraphs": [
          "A dust filter mask protects when breaking and hacking. A nose and mouth cover is only against particles, not gases or vapours. Self-contained breathing protection is needed for high/unknown concentrations or less than 19% oxygen. Hearing protection is compulsory above 85 dB(A)."
        ],
        "bullets": [
          "Dust filter: breaking and hacking",
          "Nose/mouth cover: particles only, NOT gases",
          "Self-contained: high concentrations or low oxygen",
          "Hearing protection: compulsory above 85 dB(A)",
          "Too low oxygen = breathing hazard"
        ],
        "callout": {
          "type": "danger",
          "text": "A nose and mouth cover is ONLY against particles. It does NOT protect against gases or vapours. Use proper respiratory equipment for chemical hazards."
        }
      },
      {
        "title": "Body and Fall Protection",
        "paragraphs": [
          "Warning clothing makes the wearer visible. Slipping is a hazard to feet and legs. Fall protection devices that have arrested a fall CANNOT be used again."
        ],
        "bullets": [
          "Warning clothing: visibility",
          "Slipping hazard: feet and legs",
          "Hand protection: extended wrist/arm gloves",
          "Fall protection: cannot reuse after arrest",
          "Safety harness: must fit and be adjusted"
        ]
      }
    ]
  },
  "22": {
    "sections": [
      {
        "title": "Sign Categories",
        "paragraphs": [
          "Safety signs are categorized by shape, colour, and meaning. Each category has a distinct appearance to ensure immediate recognition."
        ],
        "table": {
          "headers": [
            "Type",
            "Shape",
            "Colour",
            "Meaning"
          ],
          "rows": [
            [
              "Mandatory",
              "Round",
              "Blue + white symbol",
              "Must do"
            ],
            [
              "Warning",
              "Triangular",
              "Yellow + black edge/symbol",
              "Caution, danger"
            ],
            [
              "Prohibition",
              "Round",
              "White + red edge + red diagonal",
              "Must not do"
            ],
            [
              "Safety provision",
              "Square/rectangular",
              "Green + white symbol",
              "Safe condition"
            ],
            [
              "Fire equipment",
              "Square/rectangular",
              "Red + white symbol",
              "Fire-fighting location"
            ]
          ]
        }
      },
      {
        "title": "Warning and Mandatory Signs",
        "paragraphs": [
          "Warning signs are triangular yellow with a black edge - they mean caution/danger. Mandatory signs are round and blue with a white symbol. The design must be clear to all workers regardless of language."
        ],
        "bullets": [
          "Warning: triangular, yellow, black edge = DANGER",
          "Mandatory: round, blue, white symbol = MUST DO",
          "Design must be clear to ALL workers",
          "Language-independent communication",
          "Positioned at eye level where possible"
        ],
        "callout": {
          "type": "info",
          "text": "Signs must be designed so their meaning is clear to ALL workers - regardless of language. This is why pictograms are used."
        }
      },
      {
        "title": "Prohibition and Safety Signs",
        "paragraphs": [
          "A prohibition sign is circular white with a red edge and red diagonal. Safety provision signs are square/rectangular green with white symbols. Fire-fighting equipment signs are square/rectangular red with white symbols."
        ],
        "bullets": [
          "Prohibition: white circle, red edge, red diagonal",
          "Safety/escape: green rectangle, white symbol",
          "Fire equipment: red rectangle, white symbol",
          "Fire signs show both route and location",
          "Yellow/white stripes: passages and stacking areas"
        ]
      },
      {
        "title": "Floor Markings",
        "paragraphs": [
          "Yellow or white stripes are used for markings of passages and stacking areas. These help organize traffic flow and designate safe zones in the workplace."
        ],
        "bullets": [
          "Yellow/white stripes: passages and stacking areas",
          "Keep markings visible and maintained",
          "Do not obstruct marked areas",
          "Regular inspection of marking condition"
        ]
      }
    ]
  }
};
