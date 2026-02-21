"""Calculator tool - mathematical calculations and unit conversions."""

import json
import math

CALCULATOR_TOOLS = [
    {
        "name": "calculate",
        "description": "Evaluate a mathematical expression. Supports basic arithmetic, exponents, trigonometry, logarithms, and common math functions. Use this for any calculations the user needs.",
        "input_schema": {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "The mathematical expression to evaluate (e.g., '2 + 3 * 4', 'sqrt(144)', 'sin(pi/4)', 'log(100, 10)')"
                }
            },
            "required": ["expression"]
        }
    },
    {
        "name": "unit_convert",
        "description": "Convert between common units of measurement (length, weight, temperature, data, time).",
        "input_schema": {
            "type": "object",
            "properties": {
                "value": {
                    "type": "number",
                    "description": "The numeric value to convert"
                },
                "from_unit": {
                    "type": "string",
                    "description": "The source unit (e.g., 'km', 'miles', 'celsius', 'kg', 'GB')"
                },
                "to_unit": {
                    "type": "string",
                    "description": "The target unit (e.g., 'miles', 'km', 'fahrenheit', 'lbs', 'MB')"
                }
            },
            "required": ["value", "from_unit", "to_unit"]
        }
    }
]

# Safe math functions available for evaluation
SAFE_MATH = {
    "abs": abs,
    "round": round,
    "min": min,
    "max": max,
    "sum": sum,
    "pow": pow,
    "sqrt": math.sqrt,
    "cbrt": math.cbrt,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "asin": math.asin,
    "acos": math.acos,
    "atan": math.atan,
    "atan2": math.atan2,
    "log": math.log,
    "log2": math.log2,
    "log10": math.log10,
    "exp": math.exp,
    "floor": math.floor,
    "ceil": math.ceil,
    "factorial": math.factorial,
    "gcd": math.gcd,
    "pi": math.pi,
    "e": math.e,
    "tau": math.tau,
    "inf": math.inf,
    "radians": math.radians,
    "degrees": math.degrees,
}

# Unit conversion factors (to a base unit within each category)
UNIT_CONVERSIONS = {
    # Length -> meters
    "m": ("length", 1.0),
    "meters": ("length", 1.0),
    "km": ("length", 1000.0),
    "kilometers": ("length", 1000.0),
    "cm": ("length", 0.01),
    "centimeters": ("length", 0.01),
    "mm": ("length", 0.001),
    "millimeters": ("length", 0.001),
    "miles": ("length", 1609.344),
    "mi": ("length", 1609.344),
    "yards": ("length", 0.9144),
    "yd": ("length", 0.9144),
    "feet": ("length", 0.3048),
    "ft": ("length", 0.3048),
    "inches": ("length", 0.0254),
    "in": ("length", 0.0254),
    # Weight -> grams
    "g": ("weight", 1.0),
    "grams": ("weight", 1.0),
    "kg": ("weight", 1000.0),
    "kilograms": ("weight", 1000.0),
    "mg": ("weight", 0.001),
    "milligrams": ("weight", 0.001),
    "lbs": ("weight", 453.592),
    "pounds": ("weight", 453.592),
    "oz": ("weight", 28.3495),
    "ounces": ("weight", 28.3495),
    "tons": ("weight", 907185.0),
    # Data -> bytes
    "bytes": ("data", 1.0),
    "B": ("data", 1.0),
    "KB": ("data", 1024.0),
    "kilobytes": ("data", 1024.0),
    "MB": ("data", 1024.0 ** 2),
    "megabytes": ("data", 1024.0 ** 2),
    "GB": ("data", 1024.0 ** 3),
    "gigabytes": ("data", 1024.0 ** 3),
    "TB": ("data", 1024.0 ** 4),
    "terabytes": ("data", 1024.0 ** 4),
    # Time -> seconds
    "seconds": ("time", 1.0),
    "s": ("time", 1.0),
    "minutes": ("time", 60.0),
    "min": ("time", 60.0),
    "hours": ("time", 3600.0),
    "hr": ("time", 3600.0),
    "days": ("time", 86400.0),
    "weeks": ("time", 604800.0),
    "years": ("time", 31557600.0),
}

# Temperature is handled specially
TEMP_UNITS = {"celsius", "fahrenheit", "kelvin", "c", "f", "k"}


def execute_calculator_tool(name: str, tool_input: dict) -> str:
    """Execute a calculator tool."""
    if name == "calculate":
        return _calculate(tool_input)
    elif name == "unit_convert":
        return _unit_convert(tool_input)
    return f"Unknown calculator tool: {name}"


def _calculate(params: dict) -> str:
    expression = params["expression"]

    try:
        # Use compile + eval with restricted globals for safety
        code = compile(expression, "<string>", "eval")

        # Verify only safe names are used
        for name in code.co_names:
            if name not in SAFE_MATH:
                return json.dumps({
                    "expression": expression,
                    "error": f"Unknown function or variable: '{name}'. Available: {', '.join(sorted(SAFE_MATH.keys()))}"
                })

        result = eval(code, {"__builtins__": {}}, SAFE_MATH)
        return json.dumps({
            "expression": expression,
            "result": result
        })
    except ZeroDivisionError:
        return json.dumps({"expression": expression, "error": "Division by zero"})
    except Exception as e:
        return json.dumps({"expression": expression, "error": str(e)})


def _unit_convert(params: dict) -> str:
    value = params["value"]
    from_unit = params["from_unit"].lower().strip()
    to_unit = params["to_unit"].lower().strip()

    # Handle temperature conversions
    if from_unit in TEMP_UNITS or to_unit in TEMP_UNITS:
        return _convert_temperature(value, from_unit, to_unit)

    from_info = UNIT_CONVERSIONS.get(from_unit) or UNIT_CONVERSIONS.get(params["from_unit"])
    to_info = UNIT_CONVERSIONS.get(to_unit) or UNIT_CONVERSIONS.get(params["to_unit"])

    if not from_info:
        return json.dumps({"error": f"Unknown unit: '{params['from_unit']}'"})
    if not to_info:
        return json.dumps({"error": f"Unknown unit: '{params['to_unit']}'"})

    from_category, from_factor = from_info
    to_category, to_factor = to_info

    if from_category != to_category:
        return json.dumps({
            "error": f"Cannot convert between {from_category} ({params['from_unit']}) and {to_category} ({params['to_unit']})"
        })

    base_value = value * from_factor
    result = base_value / to_factor

    return json.dumps({
        "input": f"{value} {params['from_unit']}",
        "result": f"{result:.6g} {params['to_unit']}"
    })


def _convert_temperature(value: float, from_unit: str, to_unit: str) -> str:
    # Normalize unit names
    unit_map = {"c": "celsius", "f": "fahrenheit", "k": "kelvin"}
    from_u = unit_map.get(from_unit, from_unit)
    to_u = unit_map.get(to_unit, to_unit)

    # Convert to Celsius first
    if from_u == "celsius":
        celsius = value
    elif from_u == "fahrenheit":
        celsius = (value - 32) * 5 / 9
    elif from_u == "kelvin":
        celsius = value - 273.15
    else:
        return json.dumps({"error": f"Unknown temperature unit: {from_unit}"})

    # Convert from Celsius to target
    if to_u == "celsius":
        result = celsius
    elif to_u == "fahrenheit":
        result = celsius * 9 / 5 + 32
    elif to_u == "kelvin":
        result = celsius + 273.15
    else:
        return json.dumps({"error": f"Unknown temperature unit: {to_unit}"})

    return json.dumps({
        "input": f"{value} {from_unit}",
        "result": f"{result:.2f} {to_unit}"
    })
