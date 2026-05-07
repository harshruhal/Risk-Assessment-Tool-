
import json

# Global variables for Phase 1
assets = []
risks = []

def get_risk_level(score):
    if score >= 16: return "CRITICAL"
    if score >= 11: return "HIGH"
    if score >= 6: return "MEDIUM"
    return "LOW"

def add_asset():
    print("\n--- ADD NEW ASSET ---")
    name = input("Enter Asset Name: ")
    asset_type = input("Enter Type (e.g., Software, Hardware, Data): ")
    owner = input("Enter Asset Owner: ")
    
    try:
        criticality = int(input("Enter Criticality (1-5): "))
    except ValueError:
        criticality = 3
        print("Invalid input, defaulting to 3.")
        
    asset_id = len(assets) + 1
    new_asset = {
        "id": asset_id,
        "name": name,
        "type": asset_type,
        "owner": owner,
        "criticality": criticality
    }
    assets.append(new_asset)
    print(f"SUCCESS: Asset '{name}' added with ID {asset_id}.")

def list_assets():
    print("\n--- ASSET INVENTORY ---")
    if not assets:
        print("No assets identified in the registry.")
        return
    
    print(f"{'ID':<5} | {'NAME':<20} | {'TYPE':<10} | {'CRIT':<5} | {'OWNER'}")
    print("-" * 60)
    for a in assets:
        print(f"{a['id']:<5} | {a['name']:<20} | {a['type']:<10} | {a['criticality']:<5} | {a['owner']}")

def delete_asset():
    list_assets()
    if not assets:
        return
        
    try:
        target_id = int(input("\nEnter Asset ID to delete: "))
        found = False
        for i, a in enumerate(assets):
            if a['id'] == target_id:
                deleted = assets.pop(i)
                print(f"SUCCESS: Asset {deleted['name']} removed.")
                found = True
                break
        if not found:
            print("ERROR: Asset ID not found.")
    except ValueError:
        print("ERROR: Please enter a numeric ID.")

def asset_menu():
    while True:
        print("\n[ASSET MANAGER]")
        print("1. Add Asset")
        print("2. List Assets")
        print("3. Delete Asset")
        print("4. Back to Main Menu")
        
        choice = input("\nSelect Option (1-4): ")
        
        if choice == '1':
            add_asset()
        elif choice == '2':
            list_assets()
        elif choice == '3':
            delete_asset()
        elif choice == '4':
            break
        else:
            print("Invalid input.")

def add_risk():
    if not assets:
        print("ERROR: No assets found. You must identify assets before assessing risk.")
        return
    
    print("\n--- NEW RISK ASSESSMENT ---")
    list_assets()
    
    try:
        asset_id = int(input("\nSelect Asset ID for assessment: "))
        # Simple validation
        if not any(a['id'] == asset_id for a in assets):
            print("ERROR: Invalid Asset ID.")
            return
            
        threat = input("Identify Threat Vector (e.g. Phishing): ")
        likelihood = int(input("Likelihood (1-5): "))
        impact = int(input("Impact (1-5): "))
        
        score = likelihood * impact
        level = get_risk_level(score)
        
        new_risk = {
            "asset_id": asset_id,
            "threat": threat,
            "likelihood": likelihood,
            "impact": impact,
            "score": score,
            "level": level
        }
        risks.append(new_risk)
        print(f"SUCCESS: Risk '{threat}' indexed at {level} level ({score}).")
    except ValueError:
        print("ERROR: Likelihood and Impact must be numeric.")

def view_risks():
    print("\n--- RISK REGISTER ---")
    if not risks:
        print("No risks currently assessed.")
        return
        
    print(f"{'ASSET':<5} | {'THREAT':<20} | {'SCORE':<5} | {'LEVEL'}")
    print("-" * 50)
    for r in risks:
        print(f"{r['asset_id']:<5} | {r['threat']:<20} | {r['score']:<5} | {r['level']}")

def main():
    print("-" * 50)
    print("GUARDIAN RISK CLI - NIST SP 800-30 ENGINE")
    print("Version: 1.0.0 | Prototype: Phase 1")
    print("-" * 50)
    
    while True:
        print("\n[MAIN MENU]")
        print("1. Manage Assets")
        print("2. Add a Risk")
        print("3. View Risk Register")
        print("4. Save/Export (JSON)")
        print("5. Exit")
        
        choice = input("\nSelect Option (1-5): ")
        
        if choice == '1':
            asset_menu()
        elif choice == '2':
            add_risk()
        elif choice == '3':
            view_risks()
        elif choice == '4':
            print("\n[EXPORT DATA]")
            print(json.dumps({"assets": assets, "risks": risks}, indent=2))
        elif choice == '5':
            print("System Shutdown. Goodbye.")
            break
        else:
            print("Invalid input.")

if __name__ == "__main__":
    main()
