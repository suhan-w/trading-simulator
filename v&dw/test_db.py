import pyodbc
import pandas as pd

try:
    cnxn = pyodbc.connect(
        'DRIVER={ODBC Driver 18 for SQL Server};'
        'SERVER=dlyle.database.windows.net;'
        'DATABASE=DWV;'
        'UID=muesli;'
        'PWD=Viz(Data);'
    )
    
    query = "SELECT TOP 5 * FROM Materials"
    data = pd.read_sql(query, cnxn)
    
    print("✓ Connection successful!")
    print(data)
    cnxn.close()
    
except Exception as e:
    print(f"✗ Error: {e}")
    