import sys
import json
import pandas as pd
from prophet import Prophet
from datetime import datetime

def main():
    try:
        # Read from stdin
        input_data = sys.stdin.read()
        if not input_data:
            raise ValueError("No input data provided. Stdin is empty.")
            
        data = json.loads(input_data)
        
        if not data:
            raise ValueError("Empty data array provided.")

        # Convert to pandas DataFrame
        df = pd.DataFrame(data)
        
        # Expecting 'date' and 'amount'
        if 'date' not in df.columns or 'amount' not in df.columns:
            raise KeyError("Data must contain 'date' and 'amount' fields")
            
        # Prophet requires columns to be named 'ds' (datestamp) and 'y' (value)
        df['ds'] = pd.to_datetime(df['date']).dt.tz_localize(None)
        df['y'] = pd.to_numeric(df['amount'])
        
        # Aggregate by day in case there are multiple transactions per day
        # For Prophet, we typically want daily data
        daily_df = df.groupby('ds')['y'].sum().reset_index()

        # Initialize and fit Prophet model
        m = Prophet(daily_seasonality=True)
        m.fit(daily_df)

        # Create future dataframe (e.g., predict next 30 days)
        # In a real setup, periods should be parameterized. Defaulting to 30.
        future = m.make_future_dataframe(periods=30)
        
        # Predict
        forecast = m.predict(future)
        
        # Extract only the necessary columns for the final output
        # Usually ds, yhat, yhat_lower, yhat_upper
        result_df = forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']]
        
        # Convert 'ds' back to string
        result_df['ds'] = result_df['ds'].dt.strftime('%Y-%m-%d')
        
        # Final output
        output = {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "forecast": result_df.to_dict(orient="records")
        }
        
        # Print to stdout
        print(json.dumps(output))

    except Exception as e:
        # Print error to stdout and exit with 1
        error_output = {"error": str(e)}
        print(json.dumps(error_output))
        sys.exit(1)

if __name__ == "__main__":
    main()
