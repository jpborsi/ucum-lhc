/**
 * This class handles the parsing of a unit string into a unit object
 */

var Ucum = require('./config.js').Ucum;
var Unit = require('./unit.js').Unit;
var UnitTables = require('./unitTables.js').UnitTables;
var PrefixTables = require('./prefixTables.js').PrefixTables;

export class UnitString {

  /**
   * Constructor
   */
  constructor() {

    // Get the unit and prefix tables
    this.utabs_ = UnitTables.getInstance();
    this.pfxTabs_ = PrefixTables.getInstance();

    // Set emphasis characters to defaults.  These are used to emphasize
    // certain characters or strings in user messages.  They can be reset in
    // the useHTMLInMessages method.
    this.openEmph_ = Ucum.openEmph_;
    this.closeEmph_ = Ucum.closeEmph_;

    // Set the braces message to blank.  This message is displayed for each
    // validation request on the web page, but is included separately as
    // a note on the validation spreadsheet.  The useBraceMsgForEachString
    // method should be used to set the message to be displayed for each
    // unit string.
    this.bracesMsg_ = '';

    // Set the flags used, with indices, as place holders in unit strings
    // for parenthetical strings and strings within braces.
    this.parensFlag_ = "parens_placeholder"; // in lieu of Jehoshaphat
    this.pFlagLen_ = this.parensFlag_.length;
    this.braceFlag_ = "braces_placeholder"; // in lieu of Nebuchadnezzar
    this.bFlagLen_ = this.braceFlag_.length;

    // Message text variations for validation methods and conversion methods
    this.valMsgStart_ = "Did you mean ";
    this.valMsgEnd_ = "?";
    this.cnvMsgStart_ = "We assumed you meant ";
    this.cnvMsgEnd_ = ".";

    // Initialize the message start/end strings, which will be set when
    // parseString is called.
    this.vcMsgStart_ = null;
    this.vcMsgEnd_ = null;

    this.suggest_ = false;

    // Make this a singleton.  See UnitTables constructor for details.
    let holdThis = UnitString.prototype;
    UnitString = function () {
      throw (new Error('UnitString is a Singleton. ' +
        'Use UnitString.getInstance() instead.'));
    };
    if (exports)
      exports.UnitString = UnitString;
    UnitString.prototype = holdThis;

    let self = this;
    UnitString.getInstance = function () {
      return self
    };
  }


  /**
   * Sets the emphasis strings to the HTML used in the webpage display - or
   * blanks them out, depending on the use parameter.
   *
   * @param use flag indicating whether or not to use the braces message;
   *  defaults to true
   */
  useHTMLInMessages(use) {
    if (use === undefined || use) {
      this.openEmph_ = Ucum.openEmphHTML_;
      this.closeEmph_ = Ucum.closeEmphHTML_;
    }
    else {
      this.openEmph_ = Ucum.openEmph_;
      this.closeEmph_ = Ucum.closeEmph_;
    }
  } // end useHTMLInMessages


  /**
   * Sets the braces message to be displayed for each unit string validation
   * requested, as appropriate.
   *
   * @param use flag indicating whether or not to use the braces message;
   *  defaults to true
   */
  useBraceMsgForEachString(use) {
    if (use === undefined || use)
      this.bracesMsg_ = Ucum.bracesMsg_;
    else
      this.bracesMsg_ = '';
  }


  /**
   * Parses a unit string, returns a unit, a possibly updated version of
   * the string passed in, and messages where appropriate.
   *
   * The string returned may be updated if the input string contained unit
   * names, e.g., "pound".  The unit code ([lb_av] for pound) is placed in
   * the string returned, a the returned messages array includes a note
   * explaining the substitution.
   *
   * @param uStr the string defining the unit
   *
   * @returns an array containing: 1) the unit object (or null if there were
   *  problems creating the unit); 2) the possibly updated unit string passed
   *  in; and 2) an array of user messages (informational, error or warning).
   * @throws an error if nothing was specified.
   */
  parseString(uStr, valConv, suggest) {

    uStr = uStr.trim();
    // Make sure we have something to work with
    if (uStr === '' || uStr === null) {
      throw (new Error('Please specify a unit expression to be validated.'));
    }

    if (valConv === 'validate') {
      this.vcMsgStart_ = this.valMsgStart_;
      this.vcMsgEnd_ = this.valMsgEnd_;
    }
    else {
      this.vcMsgStart_ = this.cnvMsgStart_;
      this.vcMsgEnd_ = this.cnvMsgEnd_;
    }

    if (suggest !== undefined && suggest) {
      this.suggest_ = true;
    }

    let origString = uStr;
    let retMsg = [];
    let parensUnits = [];
    let retObj = [];

    // Extract any annotations, i.e., text enclosed in braces ({}) from the
    // string before further processing.  Store each one in the annotations
    // array and put a placeholder in the string for the annotation.  Do
    // this before other processing in case an annotation contains characters
    // that will be interpreted as parenthetical markers or operators in
    // subsequent processing.
    let annotations = [];
    uStr = this._getAnnotations(uStr, annotations, retMsg);
    if (retMsg.length > 0) {
      retObj[0] = null;
      retObj[1] = null;
      retObj[2] = retMsg;
    }
    else {
      // Flag used to block further processing on an unrecoverable error
      let endProcessing = retMsg.length > 0;

      // Check for spaces and throw an error if any are found.  The spec
      // explicitly forbids spaces except in annotations, which is why
      // this is done after the annotations are extracted instead of in
      // _parseTheString.
      if (uStr.indexOf(' ') > -1) {
        throw (new Error('Blank spaces are not allowed in unit expressions.'));
      } // end if blanks were found in the string

      retObj = this._parseTheString(uStr, origString, retMsg,
        parensUnits, annotations);
      let finalUnit = retObj[0];

      // Do a final check to make sure that finalUnit is a unit and not
      // just a number.  Something like "1/{HCP}" will return a "unit" of 1
      // - which is not a unit.
      if (finalUnit && !isNaN(finalUnit) && finalUnit !== 1) {
        let newUnit = new Unit({'csCode_': origString});
        if (newUnit) {
          newUnit['magnitude_'] = finalUnit;
        }
        else {
          throw (new Error('error processing numerical unit'));
        }
        retObj[0] = newUnit;
      } // end final check
    } // end if no annotation errors were found
    return retObj;

  } // end parseString


  /**
   * Parses a unit string, returns a unit, a possibly updated version of
   * the string passed in, and messages where appropriate.  This should
   * only be called from within this class (or by test code).
   *
   * The string returned may be updated if the input string contained unit
   * names, e.g., "pound".  The unit code ([lb_av] for pound) is placed in
   * the string returned, a the returned messages array includes a note
   * explaining the substitution.
   *
   * @param uStr the string defining the unit
   * @param origString the original unit string passed in
   * @param retMsg the array of messages to be returned
   * @param parensUnits an array to to hold unit objects obtained from
   *  parenthetical strings
   * @param annotations an array to hold annotations found in the original
   *  string
   * @returns an array containing: 1) the unit object (or null if there were
   *  problems creating the unit); 2) the possibly updated unit string passed
   *  in; and 2) an array of user messages (informational, error or warning).
   */
  _parseTheString(uStr, origString, retMsg, parensUnits, annotations) {

    // Unit to be returned
    let finalUnit = null;

    // Flag used to block further processing on an unrecoverable error
    let endProcessing = retMsg.length > 0;

    // Call _processParens to search for and process any/all parenthetical
    // strings in uStr.  Units created for parenthetical strings will be
    // stored in the parensUnits array.
    let parensResp = this._processParens(uStr, origString, parensUnits,
      annotations, retMsg);
    endProcessing = parensResp[2];

    // The array used to hold the units and their operators.
    let uArray = [];

    // Continue if we didn't hit a problem
    if (!endProcessing) {
      uStr = parensResp[0];
      origString = parensResp[1];

      // Call _makeUnitsArray to convert the string to an array of unit
      // descriptors with operators.
      let mkUArray = this._makeUnitsArray(uStr, origString, parensUnits,
                                          annotations, retMsg);

      endProcessing = mkUArray[2] ;
      if (!endProcessing) {
        uArray = mkUArray[0];
        origString = mkUArray[1];
        // Create a unit object out of each un element
        let uLen = uArray.length;
        for (let u1 = 0; u1 < uLen && !endProcessing; u1++) {
          let curCode = uArray[u1]['un'];

          // Determine the type of the "un" attribute of the current array element

          // Check to see if it's a number.  If so write the number version of
          // the number back to the "un" attribute and move on
          let curCodeNum = Number(curCode);
          if (!isNaN(curCodeNum)) {
            uArray[u1]['un'] = curCodeNum;
          }

          else {
            // The current unit array element is a string.  Check now to see
            // if it is or contains a parenthesized unit from the parensUnits
            // array.  If so, call _getParens to process the string and get the
            // unit.

            if (curCode.indexOf(this.parensFlag_) >= 0) {
              let parenUnit = this._getParensUnit(curCode, parensUnits, origString,
                annotations, retMsg);
              // if we couldn't process the string, set the end flag and bypass
              // further processing.
              endProcessing = parenUnit[1];

              // If we're good, put the unit in the uArray and replace the
              // curCode, which contains the parentheses placeholders, etc.,
              // with the unit's code - including any substitutions.
              if (!endProcessing) {
                uArray[u1]['un'] = parenUnit[0];
              }
            } // end if the curCode contains a parenthesized unit

            // Else it's not a parenthetical unit and not a number. Call
            // _makeUnit to create a unit for it.
            else {
              let uRet = this._makeUnit(curCode, annotations,
                retMsg, origString);
              if (uRet[0] === null)
                endProcessing = true;
              else {
                uArray[u1]['un'] = uRet[0];
                origString = uRet[1];
              }
            } // end if the curCode is not a parenthetical expression
          } // end if the "un" array is a not a number
        } // end do for each element in the units array
      } // end if _makeUnitsArray did not return an error
    } // end if _processParens did not find an error that causes a stop

    // If we're still good, continue
    if (!endProcessing) {
      // Process the units (and numbers) to create one final unit object
      if (uArray[0] === null || uArray == "'" || uArray[0]['un'] === undefined ||
        uArray[0]['un'] == null) {
        // not sure what this might be, but this is a safeguard
        retMsg.push(`Unit string (${origString}) did not contain anything that ` +
          'could be used to create a unit, or else something that is not ' +
          'handled yet by this package.  Sorry');
        endProcessing = true;
      }
    }
    if (!endProcessing)
      finalUnit = this._performUnitArithmetic(uArray, retMsg, origString);


    // // check for any annotation flags still there and replace them with
    // // the annotations
    // let anoLen = annotations.length;
    // for (let a = 0; a < anoLen; a++) {
    //   origString = origString.replace(this.braceFlag_ + a +
    //       this.braceFlag_, annotations[a]);
    // }
    return [finalUnit, origString, retMsg];
  } // end _parseTheString


  /**
   * Extracts all annotations from a unit string, replacing them with
   * placeholders for later evaluation.  The annotations are stored in the
   * annotations array.  This should only be called from within this class
   * (or by test code).
   *
   * @param uString the unit string being parsed
   * @param annotations the array to contain the extracted annotations
   * @param retMsg the array to contain any user messages (error and warning)
   * @returns the string after the annotations are replaced with placeholders
   */
  _getAnnotations(uString, annotations, retMsg) {
    let openBrace = uString.indexOf('{');
    while (openBrace >= 0) {

      let closeBrace = uString.indexOf('}');
      if (closeBrace < 0) {
        retMsg.push('Missing closing brace for annotation starting at ' +
          this.openEmph_ + uString.substr(openBrace) +
          this.closeEmph_);
        openBrace = -1;
      }
      else {
        let braceStr = uString.substring(openBrace, closeBrace + 1);
        let aIdx = annotations.length.toString();
        uString = uString.replace(braceStr, this.braceFlag_ + aIdx +
          this.braceFlag_);
        annotations.push(braceStr);
        openBrace = uString.indexOf('{');
      }
    } // end do while we have an opening brace

    // check for a stray/unmatched closing brace
    let closeBrace = uString.indexOf('}');
    if (closeBrace >= 0)
      retMsg.push('Missing opening brace for closing brace found at ' +
        this.openEmph_ + uString.substring(0, closeBrace + 1) +
        this.closeEmph_);
    return uString;
  } // end _getAnnotations


  /**
   * Finds and processes any/all parenthesized unit strings. This should only
   * be called from within this class (or by test code).
   *
   * Nested parenthesized strings are processed from the inside out.  The
   * parseString function is called from within this one for each parenthesized
   * unit string, and the resulting unit object is stored in the parensUnits
   * array, to be processed after all strings are translated to units.
   *
   * A placeholder is placed in the unit string returned to indicate that the
   * unit object should be obtained from the parensUnits array.  The placeholder
   * consists of the parenthesis flag (this.parensFlag_) followed by the index
   * of the unit in the parensUnits array followed by this.parensFlag_.
   *
   * @param uStr the unit string being parsed, where this will be the full
   *  string the first time this is called and parenthesized strings on any
   *  subsequent calls
   * @param origString the original string first passed in to parseString
   * @param parensUnits the array to contain the unit objects for the
   *  parenthesized unit strings
   * @param annotations the array that contains any annotations in the
   *  unit strings; passed through when _parseTheString called recursively
   * @param retMsg the array to contain any user messages (error and warning)
   * @returns an array containing the string after the parentheses are replaced,
   *  the original string, and a flag indicating whether or not an error
   *  occurred that should stop processing.
   * with placeholders
   */
  _processParens(uString, origString, parensUnits, annotations, retMsg) {

    // Unit strings array and index
    let uStrArray = [];
    let uStrAryPos = 0;
    let stopProcessing = false;

    let pu = parensUnits.length;

    // Count of characters trimmed off the beginning of the unit string (uString)
    // as units are removed from it; used for error messages to provide
    // context.
    let trimmedCt = 0;

    // Break the unit string into pieces that consist of text outside of
    // parenthetical strings and placeholders for the parenthetical units.
    // This method is called recursively for parenthetical strings and the units
    // returned are stored in the parensUnits array.
    while (uString !== "" && !stopProcessing) {
      let openCt = 0;
      let closeCt = 0;
      let openPos = uString.indexOf('(');

      // If an opening parenthesis was not found, check for an unmatched
      // close parenthesis.  If one was found report the error and end
      // processing.
      if (openPos < 0) {
        let closePos = uString.indexOf(')');
        if (closePos >= 0) {
          let theMsg = `Missing open parenthesis for close ` +
            `parenthesis at ${uString.substring(0, closePos + trimmedCt)}` +
            `${this.openEmph_}${uString.substr(closePos, 1)}${this.closeEmph_}`;
          if (closePos < uString.length - 1) {
            theMsg += `${uString.substr(closePos + 1)}`;
          }
          retMsg.push(theMsg);
          uStrArray[uStrAryPos] = uString;
          stopProcessing = true;
        } // end if a close parenthesis was found

        // If no parentheses were found in the current unit string, transfer
        // it to the units array and blank out the string, which will end
        // the search for parenthetical units.
        else {
          uStrArray[uStrAryPos] = uString;
          uString = "";
        } // end if no close parenthesis was found
      } // end if no open parenthesis was found

      // Otherwise an open parenthesis was found. Process the string that
      // includes the parenthetical group
      else {
        openCt += 1;
        // Write the text before the parentheses (if any) to the unit strings array
        let uLen = uString.length;
        if (openPos > 0) {
          uStrArray[uStrAryPos++] = uString.substr(0, openPos);
        }

        // Find the matching closePos, i.e., the one that closes the
        // parenthetical group that this one opens.  Look also for
        // another open parenthesis, in case this includes nested parenthetical
        // strings.  This continues until it finds the same number of close
        // parentheses as open parentheses, or runs out of string to check.
        // In the case of nested parentheses this will identify the outer set
        // of parentheses.
        let closePos = 0;
        let c = openPos + 1;
        for (; c < uLen && openCt != closeCt; c++) {
          if (uString[c] === '(')
            openCt += 1;
          else if (uString[c] === ')')
            closeCt += 1;
        }

        // Put a placeholder for the group in the unit strings array and recursively
        // call this method for the parenthetical group.  Put the unit returned
        // in the parensUnit array.  Set the unit string to whatever follows
        // the position of the closing parenthesis for this group, to be
        // processed by the next iteration of this loop.  If there's nothing
        // left uString is set to "".
        if (openCt === closeCt) {
          closePos = c;
          uStrArray[uStrAryPos++] = this.parensFlag_ + pu.toString() + this.parensFlag_;
          let parseResp = this._parseTheString(
            uString.substring(openPos + 1, closePos - 1),
            origString, retMsg, parensUnits, annotations);
          if (parseResp[0] === null)
            stopProcessing = true;
          else {
            origString = parseResp[1];
            parensUnits[pu++] = parseResp[0];
            uString = uString.substr(closePos);
            trimmedCt = closePos;
          }
        } // end if the number of open and close parentheses matched

        // If the number of open and close parentheses doesn't match, indicate
        // an error.
        else {
          uStrArray.push(origString.substr(openPos));
          retMsg.push(`Missing close parenthesis for open parenthesis at ` +
            `${origString.substring(0, openPos + trimmedCt)}` +
            `${this.openEmph_}${origString.substr(openPos, 1)}` +
            `${this.closeEmph_}${origString.substr(openPos + 1)}`);
          stopProcessing = true;
        }
      } // end if an open parenthesis was found
    } // end do while the input string is not empty
    return [uStrArray.join(''), origString, stopProcessing]
  } // end _processParens


  /**
   * Breaks the unit string into an array of unit descriptors and operators.
   * If a unit descriptor consists of a number preceding a unit code, with
   * no multiplication operator, e.g., 2mg instead of 2.mg, it is handled
   * as if it were a parenthetical expression.
   *
   * This should only be called from within this class (or by test code).
   *
   * @param uStr the unit string being parsed
   * @param origString passed through to _getParensUnit if it is called
   * @param parensUnits passed through to _getParensUnit if it is called
   * @param annotations passed through to _getParensUnit if it is called
   * @param retMsg passed through to _getParensUnit if it is called
   * @returns an array containing: the array representing the unit string
   *  and a flag indicating whether or not processing can continue
   */
  _makeUnitsArray(uStr, origString, parensUnits, annotations, retMsg) {

    // Separate the string into pieces based on delimiters / (division) and .
    // (multiplication).  The idea is to get an array of units on which we
    // can then perform any operations (prefixes, multiplication, division).

    let uArray1 = uStr.match(/([./]|[^./]+)/g);
    let endProcessing = false ;

    // If the first element in the array is a division operator (/), the
    // string started with '/'.  Add a first element containing 1 to the
    // array, which will cause the correct computation to be performed (inversion).
    if (uArray1[0] === "/") {
      uArray1.unshift("1");
    }
    else {

      // Check to see if there is a number preceding a unit code, e.g., 2mg
      // If so, update the first element to remove the number (2mg -> mg) and
      // add two elements to the beginning of the array - the number and the
      // multiplication operator.

      let elem = Number(uArray1[0]);
      if (isNaN(elem)) {
        let numRes = uArray1[0].match(/(^[0-9]+)([\[?a-zA-Z\_0-9a-zA-Z\_\]?]+$)/);
        if (numRes && numRes.length == 3 && numRes[1] !== '' &&
          numRes[2] !== '' && numRes[2].indexOf(this.braceFlag_) !== 0) {
          retMsg.push(`${uArray1[0]} is not a valid UCUM code.  ` +
            this.vcMsgStart_ + `${numRes[1]}.${numRes[2]}` + this.vcMsgEnd_);
          origString = origString.replace(uArray1[0], `${numRes[1]}.${numRes[2]}`);
          uArray1[0] = numRes[2];
          uArray1.unshift(numRes[1], '.');
        }
      } // end if the first element is not a number (only)
    }
    // Create an array of unit/operator objects.  The unit is, for now, the
    // string containing the unit code (e.g., Hz for hertz) including
    // a possible prefix and exponent.   The operator is the operator to be
    // applied to that unit and the one preceding it.  So, a.b would give
    // us two objects.  The first will have a unit of a, and a blank operator
    // (because it's the first unit).  The second would have a unit of b
    // and the multiplication operator (.).
    let u1 = uArray1.length;
    let uArray = [{op: "", un: uArray1[0]}];
    for (let n = 1; n < u1; n++) {
      let theOp = uArray1[n++];

      // Check to see if a number precedes a unit code.
      // If so, send the element to _processParens, inserting the multiplication
      // operator where it belongs.  Treating it as parenthetical keeps it from
      // being interpreted incorrectly because of operator parentheses.  For
      // example, if the whole string is mg/2kJ we don't want to rewrite it as
      // mg/2.kJ - because mg/2 would be performed, followed by .kJ.  Instead,
      // handling 2kJ as a parenthesized unit will make sure mg is divided by
      // 2.kJ.
      let elem2 = Number(uArray1[n]);
      if (isNaN(elem2)) {
        let numRes2 = uArray1[n].match(/(^[0-9]+)([\[?a-zA-Z\_0-9a-zA-Z\_\]?]+$)/);
        if (numRes2 && numRes2.length == 3 && numRes2[1] !== '' &&
          numRes2[2] !== '' && numRes2[2].indexOf(this.braceFlag_) !== 0) {
          let parensStr = '(' + numRes2[1] + '.' + numRes2[2] + ')';
          let parensResp = this._processParens(parensStr, parensStr, parensUnits,
            annotations, retMsg);
          // if a "stop processing" flag was returned, set the n index to end
          // the loop and set the endProcessing flag
          if (parensResp[2]) {
            n = u1;
            endProcessing = true;
          }
          // Otherwise let the user know about the problem and what we did
          else {
            parensResp[1] = parensResp[1].substring(1, parensResp[1].length - 1);
            //NO - NOT parensResp[1] - that's the correct one.
            retMsg.push(`${numRes2[0]} is not a valid UCUM code.\n` +
              this.vcMsgStart_ + `${numRes2[1]}.${numRes2[2]}` + this.vcMsgEnd_);
            origString = origString.replace(uArray1[n], parensResp[1]);
            uArray.push({op: theOp, un: parensResp[0]});
          }
        }
        else {
          uArray.push({op: theOp, un: uArray1[n]});
        }
      }
    }
    return [uArray, origString, endProcessing];
  } // end _makeUnitsArray


  /**
   * Takes a unit string containing parentheses flags and returns the unit they
   * represent.  Any text found before and/or after the parenthetical
   * expression is checked to see if we can tell what the user meant and
   * let them know what it should have been.  For example, 2(mg), which
   * would resolve to 2mg, should be 2.mg.
   *
   * This should only be called from within this class (or by test code).
   *
   * @param pStr the string being parsed
   * @returns an array containing the unit object and a flag indicating whether
   *    or not the pStr was valid whether or not corrections were made.  True
   *    indicates that no corrections (substitutions or suggestions) could be
   *    found.
   * @throws an error if an invalid parensUnit index was found.  This is
   *    a processing error.
   */
  _getParensUnit(pStr, parensUnits, origString, annotations, retMsg) {
    let stopFlag = false;
    let retAry = [];
    let retUnit = null;
    let befAnnoText = null;
    let aftAnnoText = null;

    // Get the location of the flags.  We're assuming there are only two
    // because _processParens takes care of nesting.  By the time we get
    // here we should not be looking a nested parens.  Also get any text
    // before and after the parentheses.  Once we get the unit we update
    // the input string with the unit's csCode_, which will wipe out any
    // before and after text
    let psIdx = pStr.indexOf(this.parensFlag_);
    let befText = null;
    if (psIdx > 0) {
      let befText = pStr.substr(0, psIdx - 1);
    }
    let peIdx = pStr.lastIndexOf(this.parensFlag_);
    let aftText = null;
    if (peIdx + this.pFlagLen_ < pStr.length) {
      aftText = pStr.substr(peIdx + this.pFlagLen_);
    }

    // Get the text between the flags
    let pNumText = pStr.substring(psIdx + this.pFlagLen_, peIdx);
    let pNum = Number(pNumText);
    // Make sure it's a number, and if it is, get the unit from the
    // parensUnits array
    if (!isNaN(pNum)) {
      retUnit = parensUnits[pNum];
      if (isNaN(retUnit)) {
        pStr = retUnit.csCode_;
      }
      else {
        pStr = retUnit ;
      }
    }
    // If it's not a number, it's a programming error.  Throw a fit.
    else {
      throw (new Error('Processing error - invalid parens number ' +
        `found in ${pStr}.`));
    }

    // If there's something in front of the starting parentheses flag, check to
    // see if it's a number or an annotation.
    if (befText) {
      let befNum = Number(befText);

      // If it's a number, assume that multiplication was assumed
      if (!isNaN(befNum)) {
        let nMag = retUnit.getProperty('magnitude_');
        nMag *= befNum;
        retUnit.assignVals({'magnitude_': nMag});
        pStr = `${befText}.${pStr}`;
        retMsg.push(`${befText}${pStr} is not a valid UCUM code.\n` +
          this.vcMsgStart_ + pStr + this.vcMsgEnd_);
      }
      else {
        if (befText.indexOf(this.braceFlag_) >= 0) {
          let annoRet = this._getAnnoText(befText, origString,
            annotations, retMsg);
          // if we found not only an annotation, but text before or after
          // the annotation (remembering that this is all before the
          // parentheses) throw an error - because we don't know what
          // to do with it.  Could it be missing an operator?
          if (annoRet[1] || annoRet[2]) {
            throw (new Error(`Text found before the parentheses (` +
              `${befText}) included an annotation along with other text ` +
              `for parenthetical unit ${retUnit.csCode_}`));
          }
          // Otherwise put the annotation after the unit string and note
          // the misplacement.
          pStr += annoRet[0];
          retMsg.push(`The annotation ${annoRet[0]} before the unit code is ` +
            `invalid.\n` + this.vcMsgStart_ + pStr + this.vcMsgEnd_);
        }
        // else the text before the parentheses is neither a number nor
        // an annotation.  If suggestions were NOT requested, record an
        // error.
        else if (!this.suggest_) {
          retMsg.push(`${befText} preceding the unit code ${pStr} ` +
            `is invalid.  Unable to make a substitution.`);
          stopFlag = true;
        }
        // otherwise try for suggestions
        else {
          // DO _getSuggestions HERE***
          let suggestAry = this._getSuggestions(befText);

        } // end if a brace was found or, if not, suggestions were not or
          // were requested
      } // end if text preceding the parentheses was not a number
    } // end if there was text before the parentheses

    // Process any text after the parentheses
    if (aftText) {
      // if it's an annotation, get it and add it to the pStr
      if (aftText.indexOf(this.braceFlag_) >= 0) {
        let annoRet = this._getAnnoText(aftText, origString,
          annotations, retMsg);
        // if we found not only an annotation, but text before or after
        // the annotation (remembering that this is all after the
        // parentheses) throw an error - because we don't know what
        // to do with it.  Could it be missing an operator?
        if (annoRet[1] || annoRet[2]) {
          throw (new Error(`Text found after the parentheses (` +
            `${aftText}) included an annotation along with other text ` +
            `for parenthetical unit ${retUnit.csCode_}`));
        }
        // Otherwise put the annotation after the unit string - no message
        // needed.
        pStr += annoRet[0];
      }
      // Otherwise check to see if it's an exponent.  If so, warn the
      // user that it's not valid - but try it anyway
      else {
        let aftNum = Number(aftText);
        if (!isNaN(aftNum)) {
          pStr += aftText;
          retUnit = retUnit.power(aftNum);
          retMsg.push(`An exponent (${aftText}) following a parenthesis is ` +
            `invalid as of revision 1.9 of the UCUM Specification.\n  ` +
            this.vcMsgStart_ + pStr + this.vcMsgEnd_);
        }
        // else the text after the parentheses is neither a number nor
        // an annotation.  If suggestions were NOT requested, record an
        // error.
        else if (!this.suggest_) {
          retMsg.push(`Text ${aftText} following the unit code ${pStr} ` +
            `is invalid.  Unable to make a substitution.`);
          stopFlag = true;
        }
        // otherwise try for suggestions
        else {
          // DO _getSuggestions HERE***
          let suggestAry = this._getSuggestions(befText);
        } // end if text following the parentheses not an exponent
      } // end if text following the parentheses is not an annotation
    } // end if there is text following teh parentheses
    retUnit.csCode_ = pStr;
    return [retUnit, stopFlag];
  } // end _getParensUnit

  /**
   * Takes a unit string containing annotation flags and returns the
   * annotation they represent.  This also returns any text found before
   * the annotation and any found after the annotation.
   *
   * This should only be called from within this class (or by test code).
   * NEEDS FIX in next branch to handle string with multiple annotations.
   *
   * @param pStr the string being parsed
   * @param origString the original string being parse
   * @param annotations the array of annotations extracted from the origString
   * @param retMsg the array containing messages to be returned
   * @returns an array containing the annotation for the pStr, any text found
   *          before the annotation, and any text found after the annotation
   * @throws an error if for a processing error - an invalid annotation index.
   */
  _getAnnoText(pStr, origString, annotations, retMsg) {

    // if the starting braces flag is not at index 0, get the starting
    // text and the adjust the pStr to omit it.
    let asIdx = pStr.indexOf(this.braceFlag_);
    let startText = (asIdx > 0) ? pStr.substring(0, asIdx) : null;
    if (asIdx !== 0) {
      pStr = pStr.substr(asIdx);
    }

    // Get the location of the end flag and, if text follows it, get the text
    let aeIdx = pStr.lastIndexOf(this.braceFlag_);
    let endText = ((aeIdx + this.bFlagLen_) < pStr.length) ?
      pStr.substr(aeIdx + this.bFlagLen_) : null;

    // Get the index of the annotation in the annotations array.  Check it
    // to make sure it's valid, and if not, throw an error
    let idx = pStr.substring(this.bFlagLen_, aeIdx);
    let idxNum = Number(idx);
    if (isNaN(idxNum) || idxNum >= annotations.length) {
      throw (new Error(`Processing Error - invalid annotation index found ` +
        `in ${pStr} that was created from ${origString}`));
    }

    // Replace the flags and annotation index with the annotation expression
    pStr = annotations[idxNum];
    return [pStr, startText, endText];
  } // end _getAnnoText


  /**
   * Creates a unit object from a string defining one unit.  The string
   * should consist of a unit code for a unit already defined (base or
   * otherwise).  It may include a prefix and an exponent, e.g., cm2
   * (centimeter squared).  This should only be called from within this
   * class (or by test code).
   *
   * @params uCode the string defining the unit
   * @param annotations the array to contain the extracted annotations
   * @param retMsg the array to contain any user messages (error and warning)
   * @param origString the original string to be parsed; used to provide
   *  context for messages
   * @returns an array containing:  1) a unit object, or null if there were
   *  problems creating the unit; and 2) the origString passed in, which may
   *  be updated if a unit name was translated to a unit code
   */
  _makeUnit(uCode, annotations, retMsg, origString) {

    // First try the code just as is, without looking for annotations,
    // prefixes, exponents, or elephants.
    let retUnit = this.utabs_.getUnitByCode(uCode);
    if (retUnit) {
      retUnit = retUnit.clone();
    }

    // If we found it, we're done.  No need to parse for those elephants (or
    // other stuff).
    else if (uCode.indexOf(this.braceFlag_) >= 0) {
      let getAnnoRet = this._getUnitWithAnnotation(uCode, origString,
        annotations, retMsg);
      retUnit = getAnnoRet[0];
      if (retUnit) {
        origString = getAnnoRet[1];
      }
      // If a unit is not found, retUnit will be returned null and
      // the retMsg array will contain a message describing the problem.
      // If a unit is found, of course, all is good. So ... nothing left
      // to see here, move along.
    } // end if the uCode includes an annotation

    else {

      // So we didn't find a unit for the full uCode or for one with
      // annotations.  Try looking for a unit that uses a carat (^)
      // instead of an asterisk (*)

      if (uCode.indexOf('^') > -1) {
        let tryCode = uCode.replace('^', '*');
        retUnit = this.utabs_.getUnitByCode(tryCode);
        if (retUnit) {
          retUnit = retUnit.clone();
          retUnit.csCode_ = retUnit.csCode_.replace('*', '^');
          retUnit.ciCode_ = retUnit.ciCode_.replace('*', '^');
        }
      }
      // If that didn't work, check to see if it should have brackets
      // around it (uCode = degF when it should be [degF]
      if (!retUnit) {
        let addBrackets = '[' + uCode + ']' ;
        retUnit = this.utabs_.getUnitByCode(addBrackets);
        if (retUnit) {
          retUnit = retUnit.clone();
          origString = origString.replace(uCode, addBrackets);
          retMsg.push(`${uCode} is not a valid unit expression, but ` +
            `${addBrackets} is.\n` + this.vcMsgStart_ +
            addBrackets + this.vcMsgEnd_);
        } // end if we found the unit after adding brackets
      } // end trying to add brackets

      // If we didn't find it, try it as a name
      if (!retUnit) {
        let retUnitAry = this.utabs_.getUnitByName(uCode);
        if (retUnitAry && retUnitAry.length > 0) {
          retUnit = retUnitAry[0].clone();
          let mString = 'The UCUM code for ' + uCode + ' is ' +
            retUnit.csCode_ + '.\n' + this.vcMsgStart_ +
            retUnit.csCode_ + this.vcMsgEnd_;
          let dupMsg = false;
          for (let r = 0; r < retMsg.length && !dupMsg; r++)
            dupMsg = retMsg[r] === mString;
          if (!dupMsg)
            retMsg.push(mString);
          let rStr = new RegExp('(^|[.\/({])(' + uCode + ')($|[.\/)}])');
          let res = origString.match(rStr);
          origString = origString.replace(rStr, res[1] + retUnit.csCode_ + res[3]);
          uCode = retUnit.csCode_;
        }
      }

      // If we still don't have a unit, try assuming a modifier (prefix and/or
      // exponent) and look for a unit without the modifier
      if (!retUnit) {

        let origCode = uCode;
        let origUnit = null;
        let exp = null;
        let pfxCode = null;
        let pfxObj = null;
        let pfxVal = null;

        // Look first for an exponent
        // This particular regex has been tweaked several times.  This one
        // works with the following test strings:
        // "m[H2O]-21 gives ["m{H2O]-21", "m[H2O]", "-21"]
        // "m[H2O]+21 gives ["m{H2O]+21", "m[H2O]", "+21"]
        // "m[H2O]21 gives ["m{H2O]-21", "m[H2O]", "21"]
        // "s2" gives ["s2", "s, "2"]
        // "kg" gives null
        // "m[H2O]" gives null
        // "m[H2O]23X" gives null
        let res = uCode.match(/(^[^\-\+]+?)([\-\+\d]+)$/);

        // If we got a return with an exponent, separate the exponent from the
        // unit and try to get the unit again
        if (res && res[2] && res[2] !== "") {
          let reassemble = res[1] + res[2];
          if (reassemble === uCode) {
            uCode = res[1];
            exp = res[2];
            origUnit = this.utabs_.getUnitByCode(uCode);
          } // end if nothing followed the exponent (if there was one)
        } // end if we got an exponent

        // If we still don't have a unit, separate out the prefix, if any,
        // and try without it.
        if (!origUnit) {
          // Try for a single character prefix first.
          pfxCode = uCode.charAt(0);
          pfxObj = this.pfxTabs_.getPrefixByCode(pfxCode);

          // if we got a prefix, get its info and remove it from the unit code
          if (pfxObj) {
            pfxVal = pfxObj.getValue();
            let pCodeLen = pfxCode.length;
            uCode = uCode.substr(pCodeLen);

            // try again for the unit
            origUnit = this.utabs_.getUnitByCode(uCode);

            // If we still don't have a unit, see if the prefix could be the
            // two character "da" (deka) prefix.  That's the only prefix with
            // two characters, and without this check it's interpreted as "d"
            // (deci) and the "a" is considered part of the unit code.

            if (!origUnit && pfxCode == 'd' && uCode.substr(0, 1) == 'a') {
              pfxCode = 'da';
              pfxObj = this.pfxTabs_.getPrefixByCode(pfxCode);
              pfxVal = pfxObj.getValue();
              uCode = uCode.substr(1);

              // try one more time for the unit
              origUnit = this.utabs_.getUnitByCode(uCode);
            }
          } // end if we found a prefix
        } // end if we didn't get a unit after removing an exponent

        // One more thing.  If we didn't find a unit, signal an error.
        // (We tried with the full unit string, with the unit string without
        // the exponent, and the unit string without a prefix.  That's all
        // we can try).
        if (!origUnit) {
          retMsg.push(`Unable to find unit for ${origCode}`);
          retUnit = null;
        }
        else {
          // Otherwise we found a unit object.  Clone it and then apply the
          // prefix and exponent, if any, to it.
          retUnit = origUnit.clone();
          let theDim = retUnit.getProperty('dim_');
          let theMag = retUnit.getProperty('magnitude_');
          let theName = retUnit.getProperty('name_');
          let theCiCode = retUnit.getProperty('ciCode_');
          let thePrintSymbol = retUnit.getProperty('printSymbol_');
          // If there is an exponent for the unit, apply it to the dimension
          // and magnitude now
          if (exp) {
            exp = parseInt(exp);
            let expMul = exp;
            if (theDim)
              theDim = theDim.mul(exp);
            theMag = Math.pow(theMag, exp);
            retUnit.assignVals({'magnitude_': theMag});

            // If there is also a prefix, apply the exponent to the prefix.
            if (pfxObj) {

              // if the prefix base is 10 it will have an exponent.  Multiply
              // the current prefix exponent by the exponent for the unit
              // we're working with.  Then raise the prefix value to the level
              // defined by the exponent.
              if (pfxExp) {
                expMul *= pfxObj.getExp();
                pfxVal = Math.pow(10, expMul);
              }
              // If the prefix base is not 10, it won't have an exponent.
              // At the moment I don't see any units using the prefixes
              // that aren't base 10.   But if we get one the prefix value
              // will be applied to the magnitude (below) if the unit does
              // not have a conversion function, and to the conversion prefix
              // if it does.
            } // end if there's a prefix as well as the exponent
          } // end if there's an exponent

          // Now apply the prefix, if there is one, to the conversion
          // prefix or the magnitude
          if (pfxObj) {
            if (retUnit.cnv_) {
              retUnit.assignVals({'cnvPfx_': pfxVal});
            }
            else {
              theMag *= pfxVal;
              retUnit.assignVals({'magnitude_': theMag})
            }
          }
          // if we have a prefix and/or an exponent, add them to the unit
          // attributes - name, csCode, ciCode and print symbol
          let theCode = retUnit.csCode_;
          if (pfxObj) {
            theName = pfxObj.getName() + theName;
            theCode = pfxCode + theCode;
            theCiCode = pfxObj.getCiCode() + theCiCode;
            thePrintSymbol = pfxObj.getPrintSymbol() + thePrintSymbol;
            retUnit.assignVals({
              'name_': theName,
              'csCode_': theCode,
              'ciCode_': theCiCode,
              'printSymbol_': thePrintSymbol
            });
          }
          if (exp) {
            let expStr = exp.toString();
            retUnit.assignVals({
              'name_': theName + '<sup>' + expStr + '</sup>',
              'csCode_': theCode + expStr,
              'ciCode_': theCiCode + expStr,
              'printSymbol_': thePrintSymbol + '<sup>' + expStr + '</sup>'
            });
          }
        } // end if an original unit was found (without prefix and/or exponent)

      } // end if we didn't get a unit for the full unit code (w/out modifiers)
    } // end if we didn't find the unit on the first try, before parsing
    return [retUnit, origString];
  } // end _makeUnit


  /**
   * This method handles unit creation when an annotation is included
   * in the unit string.  This basically isolates and retrieves the
   * annotation and then calls _makeUnit to try to get a unit from
   * any text that precedes or follows the annotation.
   *
   * @param uCode the string defining the unit
   * @param origString the original full string submitted to parseString
   * @param annotations the array containing extracted annotations
   * @param retMsg the array used for user messages
   * @returns the unit object found, or null if one could not be found
   */
  _getUnitWithAnnotation(uCode, origString, annotations, retMsg) {

    let retUnit = null;

    // Get the annotation and anything that precedes or follows it.
    let annoRet = this._getAnnoText(uCode, origString, annotations, retMsg);
    let annoText = annoRet[0];
    let befAnnoText = annoRet[1];
    let aftAnnoText = annoRet[2];

    // If there's no text before or after the annotation, it's probably
    // something that should be interpreted as a 1, e.g., {KCT'U}.
    // HOWEVER, it could also be a case where someone used braces instead
    // of brackets, e.g., {degF} instead of [degF].  Check for that before
    // we assume it should be a 1.
    if (!befAnnoText && !aftAnnoText) {
      let tryBrackets = '[' + annoText.substring(1, annoText.length - 1) + ']';
      let mkUnitRet = this._makeUnit(tryBrackets, annotations,
        retMsg, origString);

      // If we got back a unit, assign it to the returned unit, and add
      // a message to advise the user that brackets should enclose the code
      if (mkUnitRet[0]) {
        retUnit = mkUnitRet[0];
        origString = origString.replace(annoText, tryBrackets);
        retMsg.push(`${annoText} is not a valid unit expression, but ` +
          `${tryBrackets} is.\n` + this.vcMsgStart_ +
          tryBrackets + this.vcMsgEnd_);
      }
      // Otherwise assume that this should be interpreted as a 1
      else {
        uCode = 1;
        if (this.bracesMsg_) {
          let dup = false;
          for (let r = 0; !dup && r < retMsg.length; r++) {
            dup = (retMsg[r] === this.bracesMsg_);
          }
          if (!dup)
            retMsg.push(this.bracesMsg_);
        }
        retUnit = 1;
      }
    } // end if it's only an annotation

    else {
      // if there's text before and no text after, assume the text before
      // the annotation is the unit code (with an annotation following it).
      // Call _makeUnit for the text before the annotation.
      if (befAnnoText && !aftAnnoText) {
        // make sure that what's before the annoText is not a number, e.g.,
        // /100{cells}
        let testBef = Number(befAnnoText);
        // if it is a number, just set the return unit to the number
        if (!isNaN(testBef)) {
          retUnit = befAnnoText ;
        }
        // Otherwise try to find a unit
        else {
          let mkUnitRet = this._makeUnit(befAnnoText, annotations,
            retMsg, origString);

          // if a unit was returned
          if (mkUnitRet[0]) {
            retUnit = mkUnitRet[0];
            retUnit.csCode_ += annoText;
            origString = mkUnitRet[1];
          }
          // Otherwise add a not found message
          else {
            retMsg.push(`Unable to find a unit for ${befAnnoText} that ` +
              `precedes the annotation ${annoText}.`);
          }
        }
      }
      // else if there's only text after the annotation, try for a unit
      // from the after text and assume the user put the annotation in
      // the wrong place (and tell them)
      else if (!befAnnoText && aftAnnoText) {
        // again, test for a number
        let testAft = Number(aftAnnoText);
        // if it is a number, just set the return unit to the number
        if (!isNaN(testAft)) {
          retUnit = aftAnnoText + annoText ;
          retMsg.push(`The annotation ${annoText} before the ${aftAnnoText} is ` +
            `invalid.\n` + this.vcMsgStart_ + retUnit + this.vcMsgEnd_);
        }
        else {
          let mkUnitRet = this._makeUnit(aftAnnoText, annotations,
            retMsg, origString);
          if (mkUnitRet[0]) {
            retUnit = mkUnitRet[0];
            retUnit.csCode_ += annoText;
            origString = retUnit.csCode_;
            retMsg.push(`The annotation ${annoText} before the unit code is ` +
              `invalid.\n` + this.vcMsgStart_ + retUnit.csCode_ +
              this.vcMsgEnd_);
          }
          // Otherwise add a not found message
          else {
            retMsg.push(`Unable to find a unit for ${befAnnoText} that ` +
              `follows the annotation ${annoText}.`);
          }
        }
      }
      // else it's got text before AND after the annotation.  Now what?
      // For now this is an error.  This may be a case of a missing
      // operator but that is not handled yet.
      else {
        retMsg.push(`Unable to find a unit for ${befAnnoText}${annoText}` +
          `${aftAnnoText}.\nWe are not sure how to interpret text both before ` +
          `and after the annotation.  Sorry`);
      }
    } // else if there's text before/and or after the annotation

    return [retUnit , origString];

  } // end _getUnitWithAnnotations


  /**
   * Performs unit arithmetic for the units in the units array.  That array
   * contains units/numbers and the operators (division or multiplication) to
   * be performed on each unit/unit or unit/number pair in the array.  This
   * should only be called from within this class (or by test code).
   *
   * @params uArray the array that contains the units, numbers and operators
   *  derived from the unit string passed in to parseString
   * @param retMsg the array that contains any/all user messages (error and
   *  warning); may be empty when passed in or might not
   * @param origString the original string to be parsed; used to provide
   *  context for messages
   * @returns a single unit object that is the result of the unit arithmetic
   */
  _performUnitArithmetic(uArray, retMsg, origString) {

    let finalUnit = uArray[0]['un'];
    let uLen = uArray.length ;
    let endProcessing = false ;
    // Perform the arithmetic for the units, starting with the first 2 units.
    // We only need to do the arithmetic if we have more than one unit.
    for (var u2 = 1; u2 < uLen; u2++, !endProcessing) {
      let nextUnit = uArray[u2]['un'];
      let testNext = Number(nextUnit);
      if (!isNaN(testNext)) {
        nextUnit = testNext ;
      }
      if (nextUnit === null ||
          ((typeof nextUnit !== 'number') && (!nextUnit.getProperty))) {
        let msgString = `Unit string (${origString}) contains unrecognized ` +
                        'element' ;
        if (nextUnit) {
          msgString += ` (${this.openEmph_}${nextUnit.toString()}` +
                       `${this.closeEmph_})`;
        }
        msgString += '; could not parse full string.  Sorry';
        retMsg.push(msgString);
        endProcessing = true;
      }
      else {
        try {
          // Is the operation division?
          let thisOp = uArray[u2]['op'];
          let isDiv = thisOp === '/';

          // Perform the operation based on the type(s) of the operands

          // A.  nextUnit is a unit object:
          if (typeof nextUnit !== 'number') {

            // both are unit objects
            if (typeof finalUnit !== 'number') {
              isDiv ? finalUnit = finalUnit.divide(nextUnit) :
                  finalUnit = finalUnit.multiplyThese(nextUnit);
            }
            // finalUnit is a number; nextUnit is a unit object
            else {
              let nMag = nextUnit.getProperty('magnitude_');
              isDiv ? nMag = finalUnit / nMag : nMag *= finalUnit;
              let uString = finalUnit.toString();
              // if the original string was something like /xyz, the string was
              // processed as if it was 1/xyz, to make sure the unit arithmetic
              // is performed correctly.   Remove it from the string used to
              // create the name, as it is no longer needed.  Note that this
              // does not happen if the string is something like 7/xyz.
              if (u2 === 1 && isDiv && finalUnit === 1 && origString[0] === '/') {
                uString = '';
              }
              let theName = uString + thisOp + nextUnit.getProperty('name_');

              let theCode = uString + thisOp + nextUnit.getProperty('csCode_');
              let ciCode = uString + thisOp + nextUnit.getProperty('ciCode_');
              let printSym = uString + thisOp +
                             nextUnit.getProperty('printSymbol_');
              let theDim = nextUnit.getProperty('dim_');
              if (isDiv && theDim) {
                theDim = theDim.minus();
              }
              finalUnit = nextUnit;
              finalUnit.assignVals({'csCode_' : theCode,
                'ciCode_' : ciCode,
                'name_' : theName,
                'printSymbol_' : printSym,
                'dim_' : theDim,
                'magnitude_' : nMag});
            }
          } // end if nextUnit is not a number

          // B.  nextUnit is a number
          else {
            // nextUnit is a number; finalUnit is a unit object
            if (typeof finalUnit !== 'number') {
              let fMag = finalUnit.getProperty('magnitude_');
              isDiv ? fMag /= nextUnit :
                  fMag *= nextUnit;
              let theName = finalUnit.getProperty('name_') + thisOp +
                  nextUnit.toString();
              let theCode = finalUnit.getProperty('csCode_') + thisOp +
                  nextUnit.toString();
              finalUnit.assignVals({'csCode_' : theCode ,
                'name_': theName,
                'magnitude_': fMag});
            }
            // both are numbers
            else {
              isDiv ? finalUnit /= nextUnit :
                  finalUnit *= nextUnit;
            }
          } // end if nextUnit is a number
        }
        catch (err) {
          retMsg.unshift(err.message) ;
          endProcessing = true ;
          finalUnit = null ;
        }
      } // end if we have another valid unit/number to process
    } // end do for each unit after the first one
    return finalUnit ;
  }  // end _performUnitArithmetic

} // end class UnitString


/**
 *  This function exists ONLY until the original UnitString constructor
 *  is called for the first time.  It's defined here in case getInstance
 *  is called before the constructor.   This calls the constructor.
 *
 *  The constructor redefines the getInstance function to return the
 *  singleton UnitString object.  This is based on the UnitTables singleton
 *  implementation; see more detail in the UnitTables constructor description.
 *
 *  @return the singleton UnitString object.
 */
UnitString.getInstance = function(){
  return new UnitString();
} ;

// Perform the first request for the object, to set the getInstance method.
UnitString.getInstance();
